// Shared dispatch for inbound messages from Telegram, WhatsApp, and SMS.
// Resolves chat_id -> linked Lovable user, derives role from user_roles,
// runs Kru Glitch via the AI gateway with role-differentiated, urgency-aware
// prompts, optionally translates, and returns the reply text.
//
// Capture-only: never mutates bookings, payments, or guest-facing surfaces
// outside of staff /note + guest_escalations handoffs.
//
// Invoked SERVER-TO-SERVER by telegram-poll, twilio-webhook, and the admin
// "Test as Guest" simulator using the service-role key + internal bridge token.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ROLE_PRIORITY: Record<string, number> = {
  admin: 100, manager: 90, front_desk_supervisor: 80,
  front_desk: 70, maintenance: 60, viewer: 50, guest: 10,
};

const LANG_NAMES: Record<string, string> = {
  en: "English", th: "Thai", de: "German", fr: "French",
  ru: "Russian", zh: "Chinese", ja: "Japanese", ko: "Korean", es: "Spanish",
};

function deriveRole(roles: { role: string }[]): string {
  if (!roles?.length) return "guest";
  return roles.sort((a, b) => (ROLE_PRIORITY[b.role] ?? 0) - (ROLE_PRIORITY[a.role] ?? 0))[0].role;
}

function isStaffRole(role: string): boolean {
  return ["admin", "manager", "front_desk_supervisor", "front_desk", "maintenance", "viewer"].includes(role);
}
function canCapture(role: string): boolean {
  return ["admin", "manager", "front_desk_supervisor", "front_desk", "maintenance"].includes(role);
}

// ── URGENCY DETECTION ──────────────────────────────────────────────────────
type Urgency = "critical" | "confused" | "normal";

const CRITICAL_KEYWORDS = [
  /\b(emergency|urgent|now|asap|help)\b/i,
  /\b(arriv|arrival|landing|landed|stuck|lost|stranded)\b/i,
  /\b(transport|taxi|ferry|pickup|driver)\b/i,
  /\b(check[- ]?in|checkin|check[- ]?out)\b/i,
  /\b(payment|paid|charge|refund|deposit)\b/i,
  /\b(safety|safe|danger|fire|flood|flooded|broken|leak|sick|injur|accident|hospital|police)\b/i,
];

const CONFUSION_KEYWORDS = [
  /\bwhat\??\??$/i,
  /\bhuh\??$/i,
  /\bi\s+don'?t\s+understand\b/i,
  /\bconfus(ed|ing)\b/i,
  /\b(idk|wtf|wym)\b/i,
];

function detectUrgency(
  text: string,
  history: { role: "user" | "assistant"; content: string }[],
): Urgency {
  const t = text.trim();
  if (CRITICAL_KEYWORDS.some((r) => r.test(t))) return "critical";
  if (CONFUSION_KEYWORDS.some((r) => r.test(t))) return "confused";

  // Heuristic: very short fragments OR repeated near-identical user turns
  const userTurns = history.filter((h) => h.role === "user").map((h) => h.content);
  if (t.length < 15 && userTurns.length >= 2) {
    const last = userTurns[userTurns.length - 1] ?? "";
    if (last.length < 30 && t.length < 30) return "confused";
  }
  // Repetition: same text twice in last 3 user turns
  const recent = userTurns.slice(-3).map((s) => s.toLowerCase().trim());
  if (recent.filter((s) => s === t.toLowerCase()).length >= 1 && recent.length >= 2) {
    return "confused";
  }
  return "normal";
}

// ── ACTIVE LANGUAGE AWARENESS ─────────────────────────────────────────────
function detectScript(text: string): string {
  if (/[\u0E00-\u0E7F]/.test(text)) return "th";
  if (/[\u4E00-\u9FFF]/.test(text)) return "zh";
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return "ja";
  if (/[\uAC00-\uD7AF]/.test(text)) return "ko";
  if (/[\u0400-\u04FF]/.test(text)) return "ru";
  // crude German/Spanish/French markers
  if (/[äöüß]/i.test(text)) return "de";
  if (/[ñ¿¡]/i.test(text) || /\b(hola|gracias|por\s+favor)\b/i.test(text)) return "es";
  if (/\b(merci|bonjour|s'il\s+vous\s+pla[iî]t)\b/i.test(text)) return "fr";
  return "en";
}

const SWITCH_LANG_PATTERNS: Record<string, RegExp[]> = {
  en: [/\b(in|reply\s+in|switch\s+to)\s+english\b/i],
  th: [/\b(in|reply\s+in|switch\s+to)\s+thai\b/i, /ภาษาไทย/],
  de: [/\b(in|reply\s+in|switch\s+to)\s+german\b/i, /\bauf\s+deutsch\b/i],
  fr: [/\b(in|reply\s+in|switch\s+to)\s+french\b/i, /\ben\s+fran[cç]ais\b/i],
  ru: [/\b(in|reply\s+in|switch\s+to)\s+russian\b/i, /по-русски/i],
  zh: [/\b(in|reply\s+in|switch\s+to)\s+chinese\b/i, /中文/],
  ja: [/\b(in|reply\s+in|switch\s+to)\s+japanese\b/i, /日本語/],
  ko: [/\b(in|reply\s+in|switch\s+to)\s+korean\b/i, /한국어/],
  es: [/\b(in|reply\s+in|switch\s+to)\s+spanish\b/i, /\ben\s+espa[ñn]ol\b/i],
};
function detectLanguageSwitchRequest(text: string): string | null {
  for (const [code, patterns] of Object.entries(SWITCH_LANG_PATTERNS)) {
    if (patterns.some((r) => r.test(text))) return code;
  }
  return null;
}

// ── Yes / handoff detection across languages ──────────────────────────────
const YES_PATTERNS = [
  /^\s*(yes|yep|yeah|yup|sure|ok(ay)?|please|do\s+it|sounds?\s+good)\b/i,
  /^\s*(ใช่|ครับ|ค่ะ|โอเค)/, // th
  /^\s*(ja|bitte)\b/i,        // de
  /^\s*(oui|s'il\s+vous\s+pla[iî]t)\b/i, // fr
  /^\s*(да|пожалуйста)/i,     // ru
  /^\s*(是|好的?|可以)/,        // zh
  /^\s*(はい|お願い)/,           // ja
  /^\s*(네|예)/,                // ko
  /^\s*(s[ií]|por\s+favor)\b/i, // es
];
function isAffirmative(text: string): boolean {
  const t = text.trim();
  return YES_PATTERNS.some((r) => r.test(t));
}

// ── PERSONA: time, tone, opener rotation ──────────────────────────────────
type TimeOfDay = "morning" | "afternoon" | "evening" | "late_night";
type ThreadTone = "formal" | "casual" | "stressed" | "playful" | "neutral";

function bangkokTimeOfDay(): { tod: TimeOfDay; hour: number } {
  // Asia/Bangkok = UTC+7, no DST
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const hour = now.getUTCHours();
  let tod: TimeOfDay;
  if (hour >= 23 || hour < 6) tod = "late_night";
  else if (hour < 12) tod = "morning";
  else if (hour < 17) tod = "afternoon";
  else tod = "evening";
  return { tod, hour };
}

// Read the last 3 guest turns to infer thread tone. Sticky across the thread.
function inferThreadTone(history: { role: "user" | "assistant"; content: string }[]): ThreadTone {
  const recentUser = history.filter((h) => h.role === "user").slice(-3).map((h) => h.content);
  if (!recentUser.length) return "neutral";
  const blob = recentUser.join(" \n ").toLowerCase();
  if (/[!]{2,}|\b(help|urgent|asap|stuck|lost|stranded|scared|worried|panic|please please)\b|\?{2,}/.test(blob)) return "stressed";
  if (/(haha|lol|lmao|😂|🤣|😅|🙃|😎|jk|kidding|cheers mate|legend)/.test(blob)) return "playful";
  if (/\b(dear|kindly|would you|could you please|sir|madam|good (morning|afternoon|evening))\b/.test(blob) && !/\b(hey|yo|sup|wassup)\b/.test(blob)) return "formal";
  if (/\b(hey|yo|hiya|sup|cool|thanks|thx|ok cool|nice one)\b/.test(blob)) return "casual";
  return "neutral";
}

// Opener bank — keyed by audience + phase + time-of-day. 15+ entries.
// Selection avoids repeats inside a 5-message window by checking recent
// assistant turns in history.
const OPENERS = {
  guest: {
    upcoming: {
      morning: ["Morning.", "Up early — good.", "Morning, before things kick off:"],
      afternoon: ["Quick one:", "Right —", "Got you."],
      evening: ["Evening.", "Before you wind down:", "Ok —"],
      late_night: ["Still up?", "Late check-in mode:", "Quick — "],
    },
    active: {
      morning: ["Morning.", "Day's on.", "Up early — "],
      afternoon: ["Right.", "Ok —", "Got you."],
      evening: ["Evening.", "Winding down side:", "Ok —"],
      late_night: ["Late one — ", "Still up?", "Quick:"],
    },
    departure: {
      morning: ["Morning — last day.", "Right, departure mode:", "Ok — heading out:"],
      afternoon: ["Last stretch:", "Right —", "Ok —"],
      evening: ["Last evening — ", "Before you head out:", "Ok —"],
      late_night: ["Late one before the road:", "Quick:", "Right —"],
    },
    post_stay: {
      morning: ["Safe travels.", "Off you go —", "Door's open whenever."],
      afternoon: ["Safe travels.", "Door's open whenever.", "Take it easy."],
      evening: ["Safe travels.", "Door's open whenever.", "Take it easy."],
      late_night: ["Safe travels.", "Door's open whenever.", "Take it easy."],
    },
    none: {
      morning: ["Morning.", "Hey.", "Right —"],
      afternoon: ["Hey.", "Right —", "Ok."],
      evening: ["Evening.", "Hey.", "Ok."],
      late_night: ["Late one — ", "Hey.", "Quick:"],
    },
  },
  staff: {
    morning: ["Morning.", "Heads up:", "Quick:"],
    afternoon: ["Right.", "Heads up:", "Quick:"],
    evening: ["Evening.", "EOD:", "Quick:"],
    late_night: ["Late one:", "Quick:", "Heads up:"],
  },
} as const;

function pickOpener(args: {
  audience: "guest" | "staff";
  phase: string;
  tod: TimeOfDay;
  history: { role: "user" | "assistant"; content: string }[];
}): string {
  const { audience, phase, tod, history } = args;
  let bank: readonly string[];
  if (audience === "staff") {
    bank = OPENERS.staff[tod];
  } else {
    const phaseMap = (OPENERS.guest as any)[phase] ?? OPENERS.guest.none;
    bank = phaseMap[tod] ?? phaseMap.afternoon;
  }
  // Avoid any opener used in the last 5 assistant turns.
  const recentReplies = history.filter((h) => h.role === "assistant").slice(-5).map((h) => h.content.trim().toLowerCase());
  const fresh = bank.filter((o) => !recentReplies.some((r) => r.startsWith(o.toLowerCase())));
  const pool = fresh.length ? fresh : bank;
  // Stable variety: rotate using count of prior assistant turns.
  const idx = (history.filter((h) => h.role === "assistant").length) % pool.length;
  return pool[idx];
}

// ── Persona prompts (role-differentiated, urgency-aware) ──────────────────
function buildSystemPrompt(args: {
  role: string;
  language: string;
  channel: string;
  displayName: string;
  guestPhase?: string;
  urgency: Urgency;
  detectedLang: string;
  preferredLangCode: string;
  staffEngaged: boolean;
  history: { role: "user" | "assistant"; content: string }[];
  isFirstMessage: boolean;
}): string {
  const { role, language, channel, displayName, guestPhase, urgency, detectedLang, preferredLangCode, staffEngaged, history, isFirstMessage } = args;
  const channelLabel = channel === "sms" ? "SMS" : channel === "whatsapp" ? "WhatsApp" : "Telegram";

  if (staffEngaged) {
    // Hard step-back: prompt is unused because the serve() handler short-circuits
    // before calling the AI when staffEngaged is true. Kept here for safety only.
    return `STAFF_ENGAGED_SILENT_MODE`;
  }

  const { tod, hour } = bangkokTimeOfDay();
  const audience: "guest" | "staff" = isStaffRole(role) ? "staff" : "guest";
  const threadTone = inferThreadTone(history);
  const opener = pickOpener({ audience, phase: guestPhase ?? "none", tod, history });
  const todLabel = tod === "late_night" ? `late night (${hour}:00 Bangkok)` : tod.replace("_", " ");

  const base = `You are Kru Glitch, the resident advisor at Ground Stay (Muay Thai fight camp + accommodation, Koh Samui).
Speaking to ${displayName} over ${channelLabel}. Plain text only — no markdown, no headers. Max 3 short sentences.

THE KRU VOICE (always on, never break):
Calm authority. Seen everything. Not impressed by drama. Guides without hovering. More sensei than concierge.
Local who knows the island cold. Warm but not soft. Dry but not distant. Never performs enthusiasm.

OPENER (this turn): start the reply with "${opener}" — or a close natural variant. ${isFirstMessage ? "First message in this thread — set the tone." : "Continuing thread — don't reset, pick up where you left off."} Never reuse an opener you've used in the last 5 replies.

THREAD TONE (sticky): the guest's recent tone reads as "${threadTone}". Match and hold it across the thread. Don't reset tone per reply. Only override when urgency mode changes.

RESPONSE LENGTH MATCHING:
- Short message in (<20 words) → short reply (<40 words) unless logistics force more.
- Long anxious message → calm and structured, number steps if needed, no walls of text.
- Staff messages → always concise, no padding.

TIME-OF-DAY: It is currently ${todLabel} in Bangkok.${tod === "late_night" ? " Late-night rule: something may be wrong or they're jet-lagged. Default to calm and direct. No humor. Before answering the surface question, check briefly if they actually need help." : ""}

WIT GUARDRAILS:
- Humor only in normal urgency mode AND only after the guest has shown warmth or playfulness first.
- No jokes when the guest is stressed, confused, or it's past midnight local time.
- No forced jokes — if it doesn't fit naturally, skip it. Dry wit > jokes. You know the island; you're not trying to entertain.
- Never sarcasm with someone who's confused.

HARD NEVER-DO LIST (bake into every reply):
- Never say "As an AI…" or reference being an AI/model/assistant.
- Never open with "Great question!", "Certainly!", "Of course!", "Absolutely!" or any sycophantic filler.
- Never apologise more than once in a single conversation.
- Never say "I don't have access to that information." Either answer, or redirect to the human who can.
- Never give medical or legal advice — redirect to the appropriate authority immediately (clinic, embassy, lawyer).
- Never over-explain. Trust the guest to handle the answer.
- Never end a message with "Let me know if you need anything else" or any equivalent tail.

CAPTURE-ONLY MODE:
- You can answer, share intel, confirm what's happening.
- You CANNOT modify bookings, approve requests, record payments, or promise outcomes.
- If staff action is needed, say: "I'll flag this for the team." That's it.

UNIVERSAL RULES (non-negotiable):
- You are a translator, not a decision-maker. Pull from the platform — bookings, arrivals, payments, tasks, Playbook, Heads Up.
- INTELLIGENCE LAYER PRIORITY: If a PLAYBOOK or HEADS UP entry is provided below, that is the source of truth. Use it verbatim or summarise it faithfully. Never substitute a generic answer when verified platform content exists.
- NO GUESSING, EVER: If no confirmed answer exists in the platform data provided to you, say so. Defer ("check your arrival guide for the exact steps") or escalate ("I'll flag this for the team"). Never use "probably," "I think," "maybe," or fill gaps with assumptions.
- SURFACE CONSISTENCY: Your answers must match what appears in the Guest Portal, the arrival guide, and the staff dashboards. No contradictions depending on where the guest asks.
- LOOKOUT LAYER: Any Lookout/insight content marked "draft" or "unconfirmed" is suggestion-only. You may reference it conversationally but you MUST state it is unconfirmed until an admin approves it. You cannot publish, notify, or update the Playbook from this chat.
- ROUTING:
  • Structured topic (arrival, bookings, payments, transport, check-in) → reference the platform data and reinforce the arrival system. No freestyle.
  • Conversational topic → answer clearly, light personality allowed per role/urgency rules.
  • Unclear or ambiguous → defer immediately. Do not attempt to answer.

LANGUAGE: Respond in ${language}.`;

  // Language drift hint
  let langHint = "";
  if (detectedLang !== preferredLangCode && detectedLang !== "en" && urgency !== "normal") {
    const detName = LANG_NAMES[detectedLang] || detectedLang;
    langHint = `\n\nLANGUAGE NOTE: The user may be struggling with English. Gently offer once: "Want me to reply in ${detName}?" Keep wording very simple either way. No idioms. Short sentences.`;
  }

  // ── STAFF ROLES ──
  if (role === "admin") {
    let toneBlock = `\n\nROLE: Admin. Sharp, no-nonsense. Full operational picture: occupancy, pipeline, payments, staff coordination, exceptions. Example: "Occupancy 82%. Two late arrivals. One payment pending review."
SCOPE: Full operational data. Financials, staff overview, escalations, exception handling all in scope.
NOT YOUR LANE: Do not slip into local-guide mode. You are the operator's mirror, not a concierge.`;
    if (urgency === "critical") toneBlock += `\nURGENCY HIGH: Drop everything. Just facts. No commentary.`;
    else if (urgency === "normal") toneBlock += `\nDry tone allowed only when nothing urgent is happening. No jokes.`;
    return base + toneBlock + langHint;
  }
  if (role === "manager") {
    let toneBlock = `\n\nROLE: Manager. Briefing-level summaries and staff coordination. Operational overview, not transactional minutiae.
SCOPE: Today's pipeline, staff handoffs, exceptions to flag, daily numbers at a glance. You can see financial summaries but lead with operations.
NOT YOUR LANE: No local-guide / concierge mode. No guest-facing chit-chat. No deep payment forensics — that's admin.`;
    if (urgency === "critical") toneBlock += `\nURGENCY HIGH: Drop everything. Just facts. No commentary.`;
    else if (urgency === "normal") toneBlock += `\nDry tone allowed only when nothing urgent is happening. No jokes.`;
    return base + toneBlock + langHint;
  }
  if (role === "front_desk" || role === "front_desk_supervisor") {
    let toneBlock = `\n\nROLE: Front desk. Short, clear, slightly warm, operational. Example: "Guest arriving in ~20 min. Ferry just docked." No jokes.
SCOPE: Their tasks and guest requests they personally handle — arrivals, check-ins, pickup hand-offs, laundry/maintenance intake, day-of guest issues.
NOT YOUR LANE: No financial data (revenue, payouts, refunds, deposits). No management-level overview. No staff scheduling. No local-guide mode for guests not currently on-site. If asked outside scope: "That's a manager call — I can flag it."`;
    if (urgency === "critical") toneBlock += `\nURGENCY HIGH: Even shorter. Direct.`;
    return base + toneBlock + langHint;
  }
  if (role === "maintenance") {
    return base + `\n\nROLE: Maintenance. Direct, task-only, zero personality. Example: "New task: AC issue, Room B2." Never casual.
SCOPE: Maintenance tasks assigned to you. Nothing else.` + langHint;
  }
  if (role === "viewer") {
    return base + `\n\nROLE: Viewer (read-only). Neutral tone. No personality. Cannot capture or modify anything.` + langHint;
  }

  // ── GUEST ROLES ──
  // Hard guest rules across all phases
  const guestHardRules = `
HARD RULES:
- Arrival, transport, check-in, structured topics → reinforce the arrival system. Do NOT freestyle steps. If more detail is needed: "I can walk you through it here, but the full step-by-step is already in your arrival guide — check that for exact details."
- Never guess. If unsure: "Check the dashboard" or "I'll flag this for the team."
- Never expose other guests, other bookings, or internal ops.

LAYER 2 — JOURNEY-AWARE LOCAL INTELLIGENCE (fills gaps Layer 1 doesn't cover):
- Layer 1 (Playbook + Heads Up) ALWAYS wins. If verified platform content exists, use it verbatim or summarise faithfully — do not paraphrase with local color.
- Layer 2 only activates when no Layer 1 entry applies AND the question is in scope for the guest's current phase.
- You know THIS route and THIS island deeply. You are NOT a generic Thailand tourism guide. Decline general travel chatter ("best beaches in Thailand?") with: "Outside my lane — I know this route and this island. Want to ask about either?"`;

  if (guestPhase === "none") {
    return base + `\n\nROLE: Guest with no active booking. Politely decline anything beyond saying front desk can help.` + langHint;
  }

  let guestTone = "";
  if (urgency === "critical") {
    guestTone = `\n\nROLE: Guest (${guestPhase}). URGENCY CRITICAL → zero personality, zero jokes. Clear, direct operator mode only. Confirm what's happening, give the next concrete step, offer to flag staff.`;
  } else if (urgency === "confused") {
    guestTone = `\n\nROLE: Guest (${guestPhase}). User seems confused. Drop humor completely. Switch to structured step-by-step mode. Simpler vocabulary, no idioms, shorter sentences.`;
  } else if (guestPhase === "departure") {
    guestTone = `\n\nROLE: Guest (departure day). Proactive, warm but efficient. Structured but still human — not full operator mode, not full warmth. Guest is tired; don't make them work for it. Lead with the next concrete thing they need.`;
  } else if (guestPhase === "post_stay") {
    guestTone = `\n\nROLE: Guest (post-stay, same day as checkout). One short message only — warm, brief, "safe travels, door's open." No surveys. No questions. No upsells. No follow-ups.`;
  } else {
    guestTone = `\n\nROLE: Guest (${guestPhase}). Calm, confident, dry humor allowed but always useful first. Light situational jokes only — never forced. Think: a local who knows the island and won't let people do dumb things.`;
  }

  // Phase-specific scope (Layer 2 boundaries)
  if (guestPhase === "upcoming") {
    guestTone += `
PHASE SCOPE — PRE-ARRIVAL (Bangkok phase if applicable + transit):
- Layer 1 first: TDAC, deposit, arrival mode, arrival guide.
- Layer 2 (route-specific): BKK transit logic (BTS/MRT/Grab vs taxi), neighborhoods to stage in for an early ferry, getting from BKK to the ferry terminal (Chumphon/Donsak/Surat options + how to choose), what to pack for island weather, what to expect at the pier.
- Out of scope: Bangkok nightlife / general tourism / unrelated regions.`;
  } else if (guestPhase === "active") {
    guestTone += `
PHASE SCOPE — ON-ISLAND / IN-STAY:
- Layer 1 first: stay essentials, house rules, training schedule, on-site maintenance/laundry intake.
- Layer 2 (this island, this route): local spots near the camp, transport options (scooter rental reality check, Bolt/Grab availability, songthaew etiquette), nearest clinics + pharmacy hours, what's open right now (season-aware), beach access from the camp, island-specific Muay Thai culture context (gym etiquette, fight nights, watching vs training).
- Out of scope: other islands, mainland tourism, generic Thailand advice.`;
  } else if (guestPhase === "departure") {
    guestTone += `
PHASE SCOPE — DEPARTURE DAY:
- Layer 1 first: their checkout time, deposit release status, any open tasks.
- Layer 2: luggage storage options, transport from camp to ferry pier, ferry timing windows for their onward connection, "do I have time for X" reality checks.
- Keep it tight. One concrete next step per reply. Don't dump options.`;
  } else if (guestPhase === "post_stay") {
    guestTone += `
PHASE SCOPE — POST-STAY (same day):
- Layer 2: ferry timing back to the mainland if asked, Bangkok layover survival (where to stage near BKK/DMK if a long wait), airport tips for their flight type.
- Hard limit: one short reply. No follow-ups. No "let me know if you need anything else." Door's open, that's it.`;
  }

  // Escalation offer for confused/critical
  if (urgency === "critical" || urgency === "confused") {
    guestTone += `\n\nESCALATION OFFER: At the end of your reply, add on a new line: "Want me to notify the front desk so they can help directly? Just say yes." Only add this once per turn.`;
  }

  return base + guestTone + guestHardRules + langHint;
}

async function buildContext(admin: any, userId: string, role: string, guestPhase?: string): Promise<string> {
  if (!isStaffRole(role)) {
    const { data: bookings } = await admin
      .from("bookings")
      .select("state, check_in, check_out, units(name)")
      .eq("guest_id", userId)
      .order("check_in", { ascending: true })
      .limit(3);
    if (!bookings?.length) return "GUEST CONTEXT: No bookings on file.";
    const lines = bookings.map((b: any) =>
      `- ${b.units?.name ?? "Unit"}: ${b.check_in} → ${b.check_out} (${b.state})`
    );
    return `GUEST CONTEXT (your bookings, phase=${guestPhase ?? "none"}):\n${lines.join("\n")}`;
  }
  const [unitsRes, bookingsRes, intelRes] = await Promise.all([
    admin.from("units").select("name").eq("is_active", true).limit(20),
    admin.from("bookings").select("state").in("state", ["confirmed", "checked_in", "pending_approval", "pending_deposit"]),
    admin.from("intelligence_entries").select("title, body").eq("status", "active").contains("audience", ["staff"]).limit(5),
  ]);
  const states = (bookingsRes.data ?? []).reduce((acc: Record<string, number>, b: any) => {
    acc[b.state] = (acc[b.state] || 0) + 1; return acc;
  }, {});
  const intelLines = (intelRes.data ?? []).map((i: any) =>
    `- ${i.title}: ${String(i.body).slice(0, 160)}`
  ).join("\n");
  return `STAFF CONTEXT:
Active units: ${(unitsRes.data ?? []).map((u: any) => u.name).join(", ") || "none"}.
Booking pipeline: ${Object.entries(states).map(([s, n]) => `${s}=${n}`).join(", ") || "empty"}.
Recent staff intel:
${intelLines || "(none active)"}`;
}

// ── LIVE OPERATIONAL CONTEXT (staff/admin only) ──────────────────────────
// Pulls real-time DB data scoped strictly by role and injects it into the
// system prompt so Kru Glitch can answer operational questions with truth,
// not guesses. Guests get nothing here — they go through buildContext only.
//
// Failure-tolerant: any individual query that errors or returns empty is
// silently skipped. Never throws.
function bangkokToday(): { today: string; tomorrow: string } {
  // Asia/Bangkok = UTC+7, no DST
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const today = now.toISOString().slice(0, 10);
  const tmw = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { today, tomorrow: tmw };
}

async function buildStaffContext(
  admin: any,
  userId: string,
  role: string,
): Promise<string> {
  if (!isStaffRole(role)) return "";
  const { today, tomorrow } = bangkokToday();
  const sections: string[] = [];

  const fmtGuest = (b: any) => {
    const name = b.profiles?.full_name || "Guest";
    const unit = b.units?.name || "Unit?";
    return { name, unit };
  };

  // ── FRONT DESK + above: today's arrivals ──
  try {
    const { data: arrivals } = await admin
      .from("bookings")
      .select("check_in, state, num_guests, units(name), profiles:guest_id(full_name)")
      .eq("check_in", today)
      .in("state", ["confirmed", "pending_deposit", "checked_in"])
      .order("check_in");
    if (arrivals?.length) {
      const lines = arrivals.map((b: any) => {
        const { name, unit } = fmtGuest(b);
        return `- ${name} → ${unit} (${b.state}, ${b.num_guests}p)`;
      });
      sections.push(`Today's arrivals (${arrivals.length}):\n${lines.join("\n")}`);
    } else {
      sections.push("Today's arrivals: none.");
    }
  } catch (_) { /* skip */ }

  // ── Today's departures ──
  try {
    const { data: deps } = await admin
      .from("bookings")
      .select("check_out, state, units(name), profiles:guest_id(full_name)")
      .eq("check_out", today)
      .in("state", ["checked_in", "confirmed"])
      .order("check_out");
    if (deps?.length) {
      const lines = deps.map((b: any) => {
        const { name, unit } = fmtGuest(b);
        return `- ${name} ← ${unit} (${b.state})`;
      });
      sections.push(`Today's departures (${deps.length}):\n${lines.join("\n")}`);
    } else {
      sections.push("Today's departures: none.");
    }
  } catch (_) { /* skip */ }

  // ── Open guest escalations on currently checked-in bookings ──
  try {
    const { data: esc } = await admin
      .from("guest_escalations")
      .select("summary, channel, created_at")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(5);
    if (esc?.length) {
      const lines = esc.map((e: any) =>
        `- [${e.channel}] ${String(e.summary).slice(0, 120)}`
      );
      sections.push(`Open guest escalations (${esc.length}):\n${lines.join("\n")}`);
    }
  } catch (_) { /* skip */ }

  // ── Front desk: own assigned maintenance tasks ──
  if (role === "front_desk" || role === "front_desk_supervisor" || role === "maintenance") {
    try {
      const { data: tasks } = await admin
        .from("housekeeping_tasks")
        .select("status, due_by, units(name)")
        .eq("assigned_to", userId)
        .in("status", ["pending", "in_progress"])
        .order("due_by", { ascending: true })
        .limit(8);
      if (tasks?.length) {
        const lines = tasks.map((t: any) =>
          `- ${t.units?.name ?? "Unit"} (${t.status}${t.due_by ? `, due ${String(t.due_by).slice(0, 16)}` : ""})`
        );
        sections.push(`Your open tasks (${tasks.length}):\n${lines.join("\n")}`);
      }
    } catch (_) { /* skip */ }
  }

  // ── MANAGER + above ──
  if (role === "manager" || role === "admin") {
    // Occupancy snapshot
    try {
      const [unitsRes, occupiedRes, blocksRes] = await Promise.all([
        admin.from("units").select("id", { count: "exact", head: true }).eq("is_active", true),
        admin.from("bookings").select("unit_id", { count: "exact", head: true })
          .eq("state", "checked_in").lte("check_in", today).gt("check_out", today),
        admin.from("maintenance_blocks").select("unit_id", { count: "exact", head: true })
          .lte("start_date", today).gte("end_date", today),
      ]);
      const total = unitsRes.count ?? 0;
      const occ = occupiedRes.count ?? 0;
      const blocked = blocksRes.count ?? 0;
      const avail = Math.max(0, total - occ - blocked);
      sections.push(`Occupancy: ${occ}/${total} occupied, ${avail} available, ${blocked} maintenance.`);
    } catch (_) { /* skip */ }

    // Tomorrow's arrivals + departures
    try {
      const [arrTmw, depTmw] = await Promise.all([
        admin.from("bookings")
          .select("units(name), profiles:guest_id(full_name)")
          .eq("check_in", tomorrow)
          .in("state", ["confirmed", "pending_deposit"]),
        admin.from("bookings")
          .select("units(name), profiles:guest_id(full_name)")
          .eq("check_out", tomorrow)
          .in("state", ["checked_in", "confirmed"]),
      ]);
      const aLines = (arrTmw.data ?? []).map((b: any) => {
        const { name, unit } = fmtGuest(b);
        return `- ${name} → ${unit}`;
      });
      const dLines = (depTmw.data ?? []).map((b: any) => {
        const { name, unit } = fmtGuest(b);
        return `- ${name} ← ${unit}`;
      });
      const parts = [];
      if (aLines.length) parts.push(`Tomorrow arrivals (${aLines.length}):\n${aLines.join("\n")}`);
      if (dLines.length) parts.push(`Tomorrow departures (${dLines.length}):\n${dLines.join("\n")}`);
      if (parts.length) sections.push(parts.join("\n"));
    } catch (_) { /* skip */ }

    // Open maintenance requests
    try {
      const { data: maint } = await admin
        .from("maintenance_requests")
        .select("priority, description, units(name)")
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(8);
      if (maint?.length) {
        const lines = maint.map((m: any) =>
          `- [${m.priority}] ${m.units?.name ?? "Unit?"}: ${String(m.description).slice(0, 100)}`
        );
        sections.push(`Open maintenance (${maint.length}):\n${lines.join("\n")}`);
      } else {
        sections.push("Open maintenance: none.");
      }
    } catch (_) { /* skip */ }

    // Pending approval queue
    try {
      const { data: pend } = await admin
        .from("bookings")
        .select("check_in, units(name), profiles:guest_id(full_name)")
        .eq("state", "pending_approval")
        .order("check_in")
        .limit(8);
      if (pend?.length) {
        const lines = pend.map((b: any) => {
          const { name, unit } = fmtGuest(b);
          return `- ${name} → ${unit} (arrives ${b.check_in})`;
        });
        sections.push(`Pending approval (${pend.length}):\n${lines.join("\n")}`);
      }
    } catch (_) { /* skip */ }
  }

  // ── ADMIN only ──
  if (role === "admin") {
    // Flagged / pending payments
    try {
      const { data: pays } = await admin
        .from("payments")
        .select("amount, status, payment_type, booking_id, created_at")
        .in("status", ["pending", "failed"])
        .order("created_at", { ascending: false })
        .limit(8);
      if (pays?.length) {
        const lines = pays.map((p: any) =>
          `- ${p.payment_type} ${p.amount} (${p.status})`
        );
        sections.push(`Flagged payments (${pays.length}):\n${lines.join("\n")}`);
      }
    } catch (_) { /* skip */ }
  }

  if (!sections.length) return "";
  return `LIVE OPERATIONAL CONTEXT (as of now, Asia/Bangkok ${today}):\n${sections.join("\n\n")}`;
}

// ── Intelligence Layer lookup (Playbook + Heads Up) ──────────────────────
// Pulls active entries the user is allowed to see and ranks by lexical overlap
// with the inbound message. Returned content becomes the source of truth in
// the system prompt — Kru Glitch must use it verbatim or summarise faithfully.
async function fetchRelevantIntelligence(
  admin: any,
  text: string,
  audience: "guest" | "staff",
  detectedLang: string = "en",
): Promise<string> {
  const { data } = await admin
    .from("intelligence_entries")
    .select("type, title, body, severity, location, expires_at, translations")
    .eq("status", "active")
    .contains("audience", [audience])
    .limit(40);
  const now = Date.now();
  const live = (data ?? []).filter((e: any) =>
    !e.expires_at || new Date(e.expires_at).getTime() > now
  );
  if (!live.length) return "";

  const tokens = Array.from(new Set(
    text.toLowerCase().match(/[a-z\u00C0-\u024F\u0E00-\u0E7F]{3,}/gi) ?? []
  ));
  if (!tokens.length) return "";

  const scored = live.map((e: any) => {
    const hay = `${e.title} ${e.body}`.toLowerCase();
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += 1;
    if (e.type === "heads_up" && (e.severity === "urgent" || e.severity === "attention")) score += 1;
    return { e, score };
  }).filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (!scored.length) return "";
  const lang = (detectedLang || "en").toLowerCase();
  const lines = scored.map(({ e }) => {
    const tag = e.type === "heads_up"
      ? `HEADS UP${e.severity && e.severity !== "normal" ? ` [${e.severity}]` : ""}`
      : "PLAYBOOK";
    const translated = lang !== "en" && e.translations && typeof e.translations === "object"
      ? (e.translations as Record<string, string>)[lang]
      : null;
    const bodyText = (translated && translated.trim()) ? translated : e.body;
    const langTag = (translated && translated.trim()) ? ` (${lang})` : "";
    return `- ${tag}${langTag}: ${e.title}\n  ${String(bodyText).slice(0, 400)}`;
  });
  return `INTELLIGENCE LAYER (verified platform content — use as source of truth, verbatim or faithful summary):\n${lines.join("\n")}`;
}

async function callAI(
  systemPrompt: string,
  history: { role: "user" | "assistant"; content: string }[],
  userText: string,
  lovableApiKey: string
): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userText },
  ];
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, max_tokens: 400 }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("AI gateway error", resp.status, t);
    if (resp.status === 429) return "I'm getting a lot of messages right now — give me a minute and try again.";
    if (resp.status === 402) return "AI credits are out — front desk has been notified.";
    throw new Error(`AI gateway ${resp.status}`);
  }
  const json = await resp.json();
  return (json.choices?.[0]?.message?.content || "").trim();
}

// ── Slash command handlers (role-gated, read-only unless noted) ──

async function cmdBriefing(admin: any): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const [arr, dep, pendApr, pendDep] = await Promise.all([
    admin.from("bookings").select("id").eq("check_in", today).in("state", ["confirmed", "pending_deposit"]),
    admin.from("bookings").select("id").eq("check_out", today).eq("state", "checked_in"),
    admin.from("bookings").select("id").eq("state", "pending_approval"),
    admin.from("bookings").select("id").eq("state", "pending_deposit"),
  ]);
  return `Today: ${arr.data?.length ?? 0} arrivals, ${dep.data?.length ?? 0} departures. Pending: ${pendApr.data?.length ?? 0} approval, ${pendDep.data?.length ?? 0} deposit.`;
}
async function cmdArrivals(admin: any): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("bookings")
    .select("check_in, num_guests, units(name), profiles!bookings_guest_id_profiles_fkey(full_name)")
    .eq("check_in", today)
    .in("state", ["confirmed", "pending_deposit", "checked_in"])
    .limit(10);
  if (!data?.length) return "No arrivals today.";
  return "Today's arrivals:\n" + data.map((b: any) =>
    `- ${b.profiles?.full_name ?? "Guest"} → ${b.units?.name ?? "Unit"} (${b.num_guests}p)`
  ).join("\n");
}
async function cmdDepartures(admin: any): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("bookings")
    .select("check_out, units(name), profiles!bookings_guest_id_profiles_fkey(full_name)")
    .eq("check_out", today)
    .eq("state", "checked_in")
    .limit(10);
  if (!data?.length) return "No departures today.";
  return "Today's departures:\n" + data.map((b: any) =>
    `- ${b.profiles?.full_name ?? "Guest"} ← ${b.units?.name ?? "Unit"}`
  ).join("\n");
}
async function cmdApprovals(admin: any): Promise<string> {
  const { count } = await admin.from("bookings").select("id", { count: "exact", head: true }).eq("state", "pending_approval");
  return `${count ?? 0} bookings awaiting approval.`;
}
async function cmdOccupancy(admin: any): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const [unitsRes, occRes] = await Promise.all([
    admin.from("units").select("id", { count: "exact", head: true }).eq("is_active", true),
    admin.from("bookings").select("id", { count: "exact", head: true }).lte("check_in", today).gt("check_out", today).eq("state", "checked_in"),
  ]);
  const total = unitsRes.count ?? 0;
  const occ = occRes.count ?? 0;
  const pct = total > 0 ? Math.round((occ / total) * 100) : 0;
  return `Occupancy: ${occ}/${total} units (${pct}%).`;
}
async function cmdSecurity(admin: any): Promise<string> {
  const { data } = await admin
    .from("security_events")
    .select("event_type, severity, created_at")
    .in("severity", ["medium", "high", "critical"])
    .order("created_at", { ascending: false })
    .limit(5);
  if (!data?.length) return "No recent security events.";
  return "Recent security events:\n" + data.map((e: any) =>
    `- [${e.severity}] ${e.event_type}`
  ).join("\n");
}
async function cmdTasks(admin: any, userId: string): Promise<string> {
  const { data } = await admin
    .from("housekeeping_tasks")
    .select("status, due_by, units(name)")
    .eq("assigned_to", userId)
    .neq("status", "completed")
    .order("due_by", { ascending: true })
    .limit(10);
  const { data: maint } = await admin
    .from("maintenance_requests")
    .select("priority, description, units(name)")
    .neq("status", "resolved")
    .order("created_at", { ascending: false })
    .limit(5);
  const lines: string[] = [];
  if (data?.length) lines.push("Cleaning: " + data.map((t: any) => `${t.units?.name ?? "?"} (${t.status})`).join(", "));
  if (maint?.length) lines.push("Open issues: " + maint.length);
  return lines.length ? lines.join(" | ") : "No open tasks.";
}
async function cmdUrgent(admin: any): Promise<string> {
  const { data } = await admin
    .from("maintenance_requests")
    .select("description, units(name)")
    .eq("priority", "urgent")
    .neq("status", "resolved")
    .order("created_at", { ascending: false })
    .limit(5);
  if (!data?.length) return "No urgent issues.";
  return "Urgent:\n" + data.map((m: any) => `- ${m.units?.name ?? "?"}: ${String(m.description).slice(0, 80)}`).join("\n");
}
async function cmdIssues(admin: any): Promise<string> {
  const { data } = await admin
    .from("maintenance_requests")
    .select("priority, status")
    .neq("status", "resolved");
  const open = (data ?? []).length;
  const urgent = (data ?? []).filter((d: any) => d.priority === "urgent").length;
  return `${open} open issues (${urgent} urgent).`;
}
async function cmdBookingLookup(admin: any, query: string): Promise<string> {
  const q = query.trim();
  if (!q) return "Usage: /booking <name or ID>";
  let { data } = await admin
    .from("bookings")
    .select("id, state, check_in, check_out, num_guests, units(name), profiles!bookings_guest_id_profiles_fkey(full_name)")
    .eq("id", q)
    .maybeSingle();
  if (!data) {
    const { data: list } = await admin
      .from("bookings")
      .select("id, state, check_in, check_out, num_guests, units(name), profiles!bookings_guest_id_profiles_fkey(full_name)")
      .ilike("profiles.full_name", `%${q}%`)
      .order("check_in", { ascending: false })
      .limit(3);
    if (!list?.length) return `No booking matching "${q}".`;
    return list.map((b: any) =>
      `${b.profiles?.full_name ?? "?"}: ${b.units?.name ?? "?"} ${b.check_in}→${b.check_out} [${b.state}]`
    ).join("\n");
  }
  return `${data.profiles?.full_name ?? "?"}: ${data.units?.name ?? "?"} ${data.check_in}→${data.check_out} [${data.state}], ${data.num_guests}p`;
}

async function tryCommand(text: string, role: string, admin: any, userId: string): Promise<string | null> {
  const m = text.trim().match(/^\/(\w+)(?:\s+(.+))?$/i);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  const arg = m[2] ?? "";
  const adminCmds = ["briefing", "status", "approvals", "security"];
  const managerCmds = ["briefing", "status", "arrivals", "departures", "occupancy"];
  const supCmds = ["arrivals", "departures", "approvals", "issues"];
  const fdCmds = ["arrivals", "departures", "booking"];
  const maintCmds = ["tasks", "urgent"];
  const viewerCmds = ["status", "briefing"];
  const allowed = (() => {
    switch (role) {
      case "admin": return [...adminCmds, ...managerCmds, ...supCmds, ...fdCmds, ...maintCmds];
      case "manager": return [...managerCmds, ...supCmds, ...fdCmds];
      case "front_desk_supervisor": return supCmds;
      case "front_desk": return fdCmds;
      case "maintenance": return maintCmds;
      case "viewer": return viewerCmds;
      default: return [];
    }
  })();
  if (!allowed.includes(cmd)) return null;
  switch (cmd) {
    case "briefing": case "status": return await cmdBriefing(admin);
    case "arrivals": return await cmdArrivals(admin);
    case "departures": return await cmdDepartures(admin);
    case "approvals": return await cmdApprovals(admin);
    case "occupancy": return await cmdOccupancy(admin);
    case "security": return await cmdSecurity(admin);
    case "tasks": return await cmdTasks(admin, userId);
    case "urgent": return await cmdUrgent(admin);
    case "issues": return await cmdIssues(admin);
    case "booking": return await cmdBookingLookup(admin, arg);
  }
  return null;
}

async function getGuestPhase(
  admin: any,
  userId: string,
): Promise<"active" | "upcoming" | "departure" | "post_stay" | "none"> {
  const today = new Date().toISOString().slice(0, 10);

  // Active stay → also check whether today is checkout day → "departure"
  const { data: active } = await admin
    .from("bookings")
    .select("id, check_out")
    .eq("guest_id", userId)
    .eq("state", "checked_in")
    .limit(1);
  if (active?.length) {
    if (active[0].check_out === today) return "departure";
    return "active";
  }

  // Upcoming confirmed booking
  const { data: upcoming } = await admin
    .from("bookings").select("id").eq("guest_id", userId)
    .in("state", ["confirmed", "pending_deposit"]).gte("check_in", today).limit(1);
  if (upcoming?.length) return "upcoming";

  // Just checked out today (post-stay window — same calendar day only)
  const { data: justOut } = await admin
    .from("bookings")
    .select("id")
    .eq("guest_id", userId)
    .eq("state", "completed")
    .eq("check_out", today)
    .limit(1);
  if (justOut?.length) return "post_stay";

  return "none";
}

// ── Self-report arrival intent detection (hybrid: keyword + AI fallback) ──
const STAGE2_KEYWORDS = [
  /\bjust\s+landed\b/i, /\blanded\b/i, /\btouched?\s*down\b/i,
  /\bat\s+bkk\b/i, /\bat\s+suvarnabhumi\b/i, /\bat\s+don\s*mueang\b/i,
  /\bmade\s+it\s+to\s+(bangkok|thailand|bkk)\b/i,
  /\barrived\s+(in|at)\s+(bangkok|bkk|thailand)\b/i,
  /\bin\s+bangkok\b/i,
];
const STAGE3_KEYWORDS = [
  /\bon\s+the\s+(ferry|boat)\b/i, /\bat\s+the\s+pier\b/i,
  /\bgot\s+to\s+samui\b/i, /\barrived\s+on\s+(island|samui)\b/i,
  /\bon\s+samui\b/i, /\bjust\s+got\s+(here|to\s+samui)\b/i,
  /\bat\s+(usm|samui)\s*airport\b/i, /\blanded\s+(in|on|at)\s+samui\b/i,
];
function keywordMatchStage(text: string): "stage_2_landed" | "stage_3_island" | null {
  if (STAGE3_KEYWORDS.some((r) => r.test(text))) return "stage_3_island";
  if (STAGE2_KEYWORDS.some((r) => r.test(text))) return "stage_2_landed";
  return null;
}
async function aiClassifyArrival(text: string, apiKey: string): Promise<"stage_2_landed" | "stage_3_island" | null> {
  if (!/\b(arriv|land|here|made it|got to|on the|at the)\b/i.test(text)) return null;
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Classify guest message as exactly one of: stage_2_landed (arrived at Bangkok BKK or DMK airport), stage_3_island (arrived on Koh Samui or its pier/airport), none (anything else). Reply with the label only." },
          { role: "user", content: text.slice(0, 300) },
        ],
        max_tokens: 10,
      }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const label = (json.choices?.[0]?.message?.content ?? "").trim().toLowerCase();
    if (label.includes("stage_2")) return "stage_2_landed";
    if (label.includes("stage_3")) return "stage_3_island";
    return null;
  } catch {
    return null;
  }
}
async function detectAndFireSelfReport(
  admin: any, userId: string, text: string, apiKey: string,
): Promise<"stage_2_landed" | "stage_3_island" | null> {
  let stage = keywordMatchStage(text);
  if (!stage) stage = await aiClassifyArrival(text, apiKey);
  if (!stage) return null;
  const today = new Date().toISOString().slice(0, 10);
  const { data: bookings } = await admin
    .from("bookings").select("id").eq("guest_id", userId)
    .in("state", ["confirmed", "pending_deposit", "checked_in"])
    .gte("check_out", today).order("check_in", { ascending: true }).limit(1);
  const booking = bookings?.[0];
  if (!booking) return null;
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/guest-arrival-journey`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "self_report", booking_id: booking.id, stage, user_id: userId }),
    });
  } catch (e) {
    console.warn("self-report dispatch failed:", e);
  }
  return stage;
}

// ── Default notification preferences ──
const DEFAULT_PREFS_BY_ROLE: Record<string, string[]> = {
  admin: ["booking_approval_needed", "payment_received", "new_review", "security_alert", "new_inquiry"],
  manager: ["new_inquiry", "booking_state_change", "daily_briefing"],
  front_desk_supervisor: ["checkin_due", "checkout_due", "booking_approved"],
  front_desk: ["assigned_booking_update", "guest_arrival_change"],
  maintenance: ["task_assigned", "urgent_issue"],
  viewer: ["daily_briefing"],
  guest: ["booking_confirmed", "payment_receipt", "checkin_instructions_24h"],
};
async function seedDefaultPrefs(admin: any, userId: string, channel: string) {
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const role = deriveRole(roles ?? []);
  const types = DEFAULT_PREFS_BY_ROLE[role] ?? DEFAULT_PREFS_BY_ROLE.guest;
  const rows = types.map((notification_type) => ({ user_id: userId, channel, notification_type, enabled: true }));
  if (rows.length) {
    await admin.from("messaging_notification_prefs").upsert(rows, {
      onConflict: "user_id,channel,notification_type",
      ignoreDuplicates: true,
    });
  }
}

// ── Thread memory helpers (also stores soft state flags as system rows) ──
const FLAG_PREFIX = "__flag__:";
async function readFlags(admin: any, userId: string, channel: string): Promise<Record<string, string>> {
  const { data } = await admin
    .from("messaging_thread_memory")
    .select("content")
    .eq("user_id", userId).eq("channel", channel).eq("role", "system")
    .order("created_at", { ascending: false }).limit(20);
  const flags: Record<string, string> = {};
  for (const row of (data ?? [])) {
    const c = String(row.content ?? "");
    if (!c.startsWith(FLAG_PREFIX)) continue;
    const rest = c.slice(FLAG_PREFIX.length);
    const eq = rest.indexOf("=");
    if (eq <= 0) continue;
    const k = rest.slice(0, eq);
    if (!(k in flags)) flags[k] = rest.slice(eq + 1);
  }
  return flags;
}
async function writeFlag(admin: any, userId: string, channel: string, key: string, value: string) {
  await admin.from("messaging_thread_memory").insert({
    user_id: userId, channel, role: "system", content: `${FLAG_PREFIX}${key}=${value}`,
  });
}

async function summariseConversation(
  history: { role: "user" | "assistant" | string; content: string }[],
  latest: string,
  apiKey: string,
): Promise<string> {
  const transcript = [...history, { role: "user", content: latest }]
    .filter((h) => h.role === "user" || h.role === "assistant")
    .slice(-10)
    .map((h) => `${h.role === "user" ? "Guest" : "Bot"}: ${String(h.content).slice(0, 300)}`)
    .join("\n");
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Summarise this guest's issue in ONE plain-English sentence (max 200 chars). Focus on what the guest needs. No fluff, no labels." },
          { role: "user", content: transcript },
        ],
        max_tokens: 120,
      }),
    });
    if (!resp.ok) return latest.slice(0, 200);
    const json = await resp.json();
    const out = (json.choices?.[0]?.message?.content || "").trim();
    return (out || latest).slice(0, 240);
  } catch {
    return latest.slice(0, 200);
  }
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const internalToken = req.headers.get("x-internal-bridge");
    const { data: tokenRow } = await admin
      .from("integration_secrets").select("encrypted_value")
      .eq("secret_key", "messaging_bridge_internal_token").maybeSingle();
    if (!tokenRow || !internalToken || tokenRow.encrypted_value !== internalToken) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }

    const body = await req.json();
    const { channel, chat_id, text, display_name, simulate_user_id } = body as {
      channel: "telegram" | "whatsapp" | "sms";
      chat_id: string;
      text: string;
      display_name?: string;
      simulate_user_id?: string; // admin "Test as Guest" only
    };

    if (!channel || !chat_id || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "channel, chat_id, text required" }), { status: 400 });
    }
    const trimmed = text.trim();

    // ── Linking flow (skip in simulate mode) ──
    if (!simulate_user_id) {
      const linkMatch =
        trimmed.match(/^\/?link\s+(\d{6})\b/i) ??
        trimmed.match(/^\/?start\s+link[_-]?(\d{6})\b/i) ??
        trimmed.match(/^\/?start\s+(\d{6})\b/i);
      if (linkMatch) {
        const code = linkMatch[1];
        const { data: codeRow } = await admin
          .from("messaging_link_codes")
          .select("id, user_id, expires_at, used_at")
          .eq("code", code).is("used_at", null).maybeSingle();
        if (!codeRow || new Date(codeRow.expires_at) < new Date()) {
          await admin.from("messaging_inbound_log").insert({
            channel, chat_id, inbound_text: trimmed, outcome: "link_invalid",
          });
          return new Response(JSON.stringify({
            reply: "That code is invalid or expired. Generate a fresh one in the app.",
          }), { headers: { "Content-Type": "application/json" } });
        }
        await admin.from("messaging_chat_bindings").upsert({
          user_id: codeRow.user_id, channel, chat_id,
          display_name: display_name || null,
        }, { onConflict: "channel,chat_id" });
        await admin.from("messaging_link_codes").update({
          used_at: new Date().toISOString(), used_channel: channel, used_chat_id: chat_id,
        }).eq("id", codeRow.id);
        await seedDefaultPrefs(admin, codeRow.user_id, channel);
        await admin.from("messaging_inbound_log").insert({
          channel, chat_id, user_id: codeRow.user_id,
          inbound_text: trimmed, outcome: "linked",
        });
        return new Response(JSON.stringify({
          reply: "You're connected! I'll keep you updated throughout your stay. Just message me anytime.",
        }), { headers: { "Content-Type": "application/json" } });
      }
    }

    // ── Resolve user (real binding or simulated) ──
    let userId: string;
    if (simulate_user_id) {
      // Verify caller is admin/manager via the simulator path: we trust the
      // internal token gate above + simulator only invokable from admin UI.
      userId = simulate_user_id;
    } else {
      const { data: binding } = await admin
        .from("messaging_chat_bindings")
        .select("user_id").eq("channel", channel).eq("chat_id", chat_id).maybeSingle();
      if (!binding) {
        await admin.from("messaging_inbound_log").insert({
          channel, chat_id, inbound_text: trimmed, outcome: "unlinked",
        });
        return new Response(JSON.stringify({
          reply: "Hey — we're not connected yet. Open the app, generate a 6-digit code, then send: /link 123456",
        }), { headers: { "Content-Type": "application/json" } });
      }
      userId = binding.user_id;

      // /unlink
      if (/^\/?unlink\b/i.test(trimmed)) {
        await admin.from("messaging_chat_bindings").delete()
          .eq("channel", channel).eq("chat_id", chat_id);
        await admin.from("messaging_inbound_log").insert({
          channel, chat_id, user_id: userId,
          inbound_text: trimmed, outcome: "unlinked_by_user",
        });
        return new Response(JSON.stringify({
          reply: "Done — disconnected. Re-link anytime from the app.",
        }), { headers: { "Content-Type": "application/json" } });
      }

      admin.from("messaging_chat_bindings")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("channel", channel).eq("chat_id", chat_id).then(() => {});
    }

    // ── Resolve role + language + phase ──
    const [{ data: roles }, { data: profile }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", userId),
      admin.from("profiles").select("preferred_language, full_name").eq("user_id", userId).maybeSingle(),
    ]);
    const role = deriveRole(roles ?? []);
    const friendlyName = display_name || profile?.full_name || "there";
    const guestPhase = !isStaffRole(role) ? await getGuestPhase(admin, userId) : undefined;

    // Block guests with no booking
    if (!isStaffRole(role) && guestPhase === "none") {
      const reply = "I can't help until you have a booking confirmed. Front desk can assist.";
      await admin.from("messaging_inbound_log").insert({
        channel, chat_id, user_id: userId,
        inbound_text: trimmed.slice(0, 1000), outbound_text: reply, outcome: "guest_no_booking",
      });
      return new Response(JSON.stringify({ reply }), { headers: { "Content-Type": "application/json" } });
    }

    // /note <text> — staff only
    const noteMatch = trimmed.match(/^\/?note\s+(.+)/is);
    if (noteMatch && canCapture(role) && !simulate_user_id) {
      const noteText = noteMatch[1].trim().slice(0, 2000);
      const { data: lastBooking } = await admin
        .from("bookings").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (!lastBooking) {
        return new Response(JSON.stringify({
          reply: "No active booking found to attach the note to.",
        }), { headers: { "Content-Type": "application/json" } });
      }
      await admin.from("messages").insert({
        booking_id: lastBooking.id, sender_id: userId,
        content: `[via ${channel}] ${noteText}`, is_internal: true, draft: false,
      });
      await admin.from("messaging_inbound_log").insert({
        channel, chat_id, user_id: userId,
        inbound_text: trimmed, outcome: "note_captured",
      });
      return new Response(JSON.stringify({
        reply: `Captured. Internal note saved on your last booking.`,
      }), { headers: { "Content-Type": "application/json" } });
    }

    // /help
    if (/^\/?help\b/i.test(trimmed)) {
      const helpByRole: Record<string, string> = {
        admin: "Commands: /briefing /status /arrivals /departures /approvals /occupancy /security /booking <name> /tasks /urgent /note <text> /unlink",
        manager: "Commands: /briefing /arrivals /departures /occupancy /approvals /booking <name> /note /unlink",
        front_desk_supervisor: "Commands: /arrivals /departures /approvals /issues /note /unlink",
        front_desk: "Commands: /arrivals /departures /booking <name> /note /unlink",
        maintenance: "Commands: /tasks /urgent /note /unlink",
        viewer: "Commands: /status /briefing /unlink (read-only)",
        guest: "Just ask anything about your stay. /unlink to disconnect.",
      };
      return new Response(JSON.stringify({ reply: helpByRole[role] ?? helpByRole.guest }), { headers: { "Content-Type": "application/json" } });
    }

    // Slash commands (staff)
    if (isStaffRole(role)) {
      const cmdReply = await tryCommand(trimmed, role, admin, userId);
      if (cmdReply !== null) {
        await admin.from("messaging_inbound_log").insert({
          channel, chat_id, user_id: userId,
          inbound_text: trimmed.slice(0, 500),
          outbound_text: cmdReply.slice(0, 2000), outcome: "command",
        });
        return new Response(JSON.stringify({ reply: cmdReply }), { headers: { "Content-Type": "application/json" } });
      }
    }

    // Pull rolling thread memory (last 10 user/assistant turns)
    const { data: memoryRows } = await admin
      .from("messaging_thread_memory")
      .select("role, content")
      .eq("user_id", userId).eq("channel", channel)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false }).limit(10);
    const history = (memoryRows ?? []).reverse() as { role: "user" | "assistant"; content: string }[];

    // Soft-state flags (staffEngaged, langOverride)
    const flags = await readFlags(admin, userId, channel);
    const staffEngaged = flags.staffEngaged === "true";
    const langOverride = flags.langOverride;

    // ── Hard step-back: if staff have taken over, Kru Glitch goes silent.
    // No AI call, no reply text. Allow only an explicit /resume command from
    // staff-capable roles to clear the flag.
    if (staffEngaged) {
      if (/^\/?resume\b/i.test(trimmed) && canCapture(role)) {
        await writeFlag(admin, userId, channel, "staffEngaged", "false");
        await admin.from("messaging_inbound_log").insert({
          channel, chat_id, user_id: userId,
          inbound_text: trimmed.slice(0, 500), outbound_text: "resumed",
          outcome: "staff_resume",
        });
        return new Response(JSON.stringify({
          reply: "Kru Glitch is back online for this chat.",
        }), { headers: { "Content-Type": "application/json" } });
      }
      await admin.from("messaging_inbound_log").insert({
        channel, chat_id, user_id: userId,
        inbound_text: trimmed.slice(0, 1000), outcome: "staff_engaged_silent",
      });
      // Empty reply tells the inbound adapter (telegram-poll / twilio-webhook) to send nothing.
      return new Response(JSON.stringify({ reply: "", silent: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Active language awareness — preferred vs detected vs explicit override
    const detectedLang = detectScript(trimmed);
    const switchTo = detectLanguageSwitchRequest(trimmed);
    if (switchTo) {
      await writeFlag(admin, userId, channel, "langOverride", switchTo);
    }
    const effectiveLangCode = (switchTo ?? langOverride ?? profile?.preferred_language ?? "en").toLowerCase();
    const effectiveLangName = LANG_NAMES[effectiveLangCode] || "English";
    const preferredLangCode = (profile?.preferred_language ?? "en").toLowerCase();

    // Self-report arrival detection (real bindings only)
    if (!simulate_user_id && !isStaffRole(role) && (guestPhase === "active" || guestPhase === "upcoming")) {
      const stage = await detectAndFireSelfReport(admin, userId, trimmed, lovableApiKey);
      if (stage) console.log(`Self-report stage detected for user ${userId}: ${stage}`);
    }

    // Urgency classification
    const urgency = detectUrgency(trimmed, history);

    // ── Guest -> Staff escalation flow (only for guest role, not in simulate mode persistence) ──
    if (!isStaffRole(role) && !staffEngaged && !simulate_user_id) {
      const offered = flags.escalationOffered === "true";
      // If we previously offered escalation and the guest now says yes, trigger handoff
      if (offered && isAffirmative(trimmed)) {
        const summary = await summariseConversation(history, trimmed, lovableApiKey);
        await admin.from("guest_escalations").insert({
          guest_user_id: userId, channel, chat_id,
          summary: `Guest ${friendlyName}, ${channel}: ${summary}`,
        });
        await writeFlag(admin, userId, channel, "staffEngaged", "true");
        await writeFlag(admin, userId, channel, "escalationOffered", "false");
        const reply = "Done — front desk has been notified. They'll follow up with you directly.";
        await admin.from("messaging_inbound_log").insert({
          channel, chat_id, user_id: userId,
          inbound_text: trimmed.slice(0, 1000), outbound_text: reply, outcome: "escalated",
        });
        await admin.from("messaging_thread_memory").insert([
          { user_id: userId, channel, role: "user", content: trimmed.slice(0, 1500) },
          { user_id: userId, channel, role: "assistant", content: reply },
        ]);
        return new Response(JSON.stringify({ reply }), { headers: { "Content-Type": "application/json" } });
      }
      // If urgency triggers an offer this turn, mark it so a follow-up "yes" is recognised
      if (urgency === "critical" || urgency === "confused") {
        await writeFlag(admin, userId, channel, "escalationOffered", "true");
      }
    }

    // ── Build prompt + call AI ──
    const audience = isStaffRole(role) ? "staff" : "guest";
    const [context, intel, liveOps] = await Promise.all([
      buildContext(admin, userId, role, guestPhase),
      fetchRelevantIntelligence(admin, trimmed, audience),
      buildStaffContext(admin, userId, role),
    ]);
    const promptParts = [
      buildSystemPrompt({
        role, language: effectiveLangName, channel, displayName: friendlyName,
        guestPhase, urgency, detectedLang, preferredLangCode, staffEngaged,
        history, isFirstMessage: history.length === 0,
      }),
      context,
    ];
    if (intel) promptParts.push(intel);
    if (liveOps) promptParts.push(liveOps);
    const systemPrompt = promptParts.join("\n\n");
    const reply = await callAI(systemPrompt, history, trimmed, lovableApiKey);

    // Persist memory + log (skip persistence in simulate mode so simulator runs are clean)
    if (!simulate_user_id) {
      await admin.from("messaging_thread_memory").insert([
        { user_id: userId, channel, role: "user", content: trimmed.slice(0, 1500) },
        { user_id: userId, channel, role: "assistant", content: reply.slice(0, 1500) },
      ]);
      await admin.from("messaging_inbound_log").insert({
        channel, chat_id, user_id: userId,
        inbound_text: trimmed.slice(0, 1000),
        outbound_text: reply.slice(0, 2000), outcome: "answered",
      });
      admin.from("security_events").insert({
        event_type: "ai_assistant_call", severity: "info",
        actor_id: userId, details: { source: `messaging-bridge:${channel}` },
      }).then(() => {});
    }

    return new Response(JSON.stringify({ reply, urgency, simulated: !!simulate_user_id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("messaging-router error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
