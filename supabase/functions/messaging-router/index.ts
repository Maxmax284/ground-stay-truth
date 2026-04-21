// Shared dispatch for inbound messages from Telegram, WhatsApp, and SMS.
// Resolves chat_id -> linked Lovable user, derives role from user_roles,
// runs Kru Glitch via the AI gateway, optionally translates to user's
// preferred language, and returns the reply text + outbound channel info.
//
// Capture-only: never mutates bookings, payments, or guest-facing surfaces
// outside of staff /note. Includes role-specific slash commands and
// rolling thread memory (last 10 turns per user+channel).
//
// Invoked SERVER-TO-SERVER by telegram-poll and twilio-webhook using the
// service-role key + internal bridge token.

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

// Viewer is staff for read-only purposes (intel, briefings) but not for capture.
function isStaffRole(role: string): boolean {
  return ["admin", "manager", "front_desk_supervisor", "front_desk", "maintenance", "viewer"].includes(role);
}
function canCapture(role: string): boolean {
  // Viewer: read-only. Maintenance/front_desk and up: can capture notes.
  return ["admin", "manager", "front_desk_supervisor", "front_desk", "maintenance"].includes(role);
}

function buildSystemPrompt(role: string, language: string, channel: string, displayName: string, guestPhase?: string): string {
  const channelLabel = channel === "sms" ? "SMS" : channel === "whatsapp" ? "WhatsApp" : "Telegram";
  const base = `You are Kru Glitch, the resident advisor at Ground Stay (a Muay Thai fight camp + accommodation in Koh Samui).
You are speaking to ${displayName} over ${channelLabel}. This is a chat bridge — keep replies short and warm, max 3 short sentences. No markdown, no headers, plain text only (chat clients show it raw).

CAPTURE-ONLY MODE:
- You can answer questions, share local intel, and confirm what's happening.
- You CANNOT modify bookings, approve requests, record payments, or promise outcomes.
- If something needs staff action, say: "I'll flag this for staff." That's it — no elaboration.

LANGUAGE: Respond in ${language}.`;

  if (isStaffRole(role)) {
    return base + `

ROLE: Staff (${role}). You can discuss operational intel, today's pickups, units, and bookings at a high level. Do NOT expose payment amounts to front_desk; supervisors and above can confirm payment existence but not details unless asked.${role === "viewer" ? "\nVIEWER: read-only. You cannot capture notes or modify anything." : ""}`;
  }

  // Guest concierge — phase-gated
  if (guestPhase === "active") {
    return base + `

ROLE: Active guest (checked in). Full concierge for THIS guest's stay only — local intel, transport, food, training, what's open. Never expose internal ops, other guests, or staff workflows.`;
  }
  if (guestPhase === "upcoming") {
    return base + `

ROLE: Pre-arrival guest. Help with airport logistics, transport options, what to pack, TDAC (Thailand Digital Arrival Card), ferry/bus info, weather expectations. Do NOT discuss internal operations or other guests.`;
  }
  return base + `

ROLE: Guest with no active booking. Politely decline anything beyond saying front desk can help.`;
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

async function cmdStatus(admin: any): Promise<string> {
  return await cmdBriefing(admin);
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
  // Try ID first
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

// Map slash command to handler, gated by role
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

// ── Guest booking phase (gates concierge access) ──
async function getGuestPhase(admin: any, userId: string): Promise<"active" | "upcoming" | "none"> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: active } = await admin
    .from("bookings").select("id").eq("guest_id", userId).eq("state", "checked_in").limit(1);
  if (active?.length) return "active";
  const { data: upcoming } = await admin
    .from("bookings").select("id").eq("guest_id", userId)
    .in("state", ["confirmed", "pending_deposit"]).gte("check_in", today).limit(1);
  if (upcoming?.length) return "upcoming";
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
  admin: any,
  userId: string,
  text: string,
  apiKey: string,
): Promise<"stage_2_landed" | "stage_3_island" | null> {
  let stage = keywordMatchStage(text);
  if (!stage) stage = await aiClassifyArrival(text, apiKey);
  if (!stage) return null;

  const today = new Date().toISOString().slice(0, 10);
  const { data: bookings } = await admin
    .from("bookings")
    .select("id")
    .eq("guest_id", userId)
    .in("state", ["confirmed", "pending_deposit", "checked_in"])
    .gte("check_out", today)
    .order("check_in", { ascending: true })
    .limit(1);
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

// ── Default notification preferences seeded on first link ──
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
    // Upsert with ignoreDuplicates so we don't overwrite user toggles
    await admin.from("messaging_notification_prefs").upsert(rows, {
      onConflict: "user_id,channel,notification_type",
      ignoreDuplicates: true,
    });
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

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
      .from("integration_secrets")
      .select("encrypted_value")
      .eq("secret_key", "messaging_bridge_internal_token")
      .maybeSingle();
    if (!tokenRow || !internalToken || tokenRow.encrypted_value !== internalToken) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }

    const body = await req.json();
    const { channel, chat_id, text, display_name } = body as {
      channel: "telegram" | "whatsapp" | "sms";
      chat_id: string;
      text: string;
      display_name?: string;
    };

    if (!channel || !chat_id || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "channel, chat_id, text required" }), { status: 400 });
    }

    const trimmed = text.trim();

    // /link 123456
    const linkMatch = trimmed.match(/^\/?link\s+(\d{6})\b/i);
    if (linkMatch) {
      const code = linkMatch[1];
      const { data: codeRow } = await admin
        .from("messaging_link_codes")
        .select("id, user_id, expires_at, used_at")
        .eq("code", code)
        .is("used_at", null)
        .maybeSingle();

      if (!codeRow || new Date(codeRow.expires_at) < new Date()) {
        await admin.from("messaging_inbound_log").insert({
          channel, chat_id, inbound_text: trimmed, outcome: "link_invalid",
        });
        return new Response(JSON.stringify({
          reply: "That code is invalid or expired. Generate a fresh one in the app.",
        }), { headers: { "Content-Type": "application/json" } });
      }

      await admin.from("messaging_chat_bindings").upsert({
        user_id: codeRow.user_id,
        channel, chat_id,
        display_name: display_name || null,
      }, { onConflict: "channel,chat_id" });

      await admin.from("messaging_link_codes").update({
        used_at: new Date().toISOString(),
        used_channel: channel,
        used_chat_id: chat_id,
      }).eq("id", codeRow.id);

      // Auto-seed role-based notification defaults
      await seedDefaultPrefs(admin, codeRow.user_id, channel);

      await admin.from("messaging_inbound_log").insert({
        channel, chat_id, user_id: codeRow.user_id,
        inbound_text: trimmed, outcome: "linked",
      });

      return new Response(JSON.stringify({
        reply: "You're linked. Default notifications are on — adjust them in the app anytime. Send anything to chat. /unlink to disconnect.",
      }), { headers: { "Content-Type": "application/json" } });
    }

    // Find binding
    const { data: binding } = await admin
      .from("messaging_chat_bindings")
      .select("user_id")
      .eq("channel", channel)
      .eq("chat_id", chat_id)
      .maybeSingle();

    if (!binding) {
      await admin.from("messaging_inbound_log").insert({
        channel, chat_id, inbound_text: trimmed, outcome: "unlinked",
      });
      return new Response(JSON.stringify({
        reply: "Hey — we're not connected yet. Open the app, generate a 6-digit code, then send: /link 123456",
      }), { headers: { "Content-Type": "application/json" } });
    }

    // /unlink
    if (/^\/?unlink\b/i.test(trimmed)) {
      await admin.from("messaging_chat_bindings")
        .delete()
        .eq("channel", channel)
        .eq("chat_id", chat_id);
      await admin.from("messaging_inbound_log").insert({
        channel, chat_id, user_id: binding.user_id,
        inbound_text: trimmed, outcome: "unlinked_by_user",
      });
      return new Response(JSON.stringify({
        reply: "Done — disconnected. Re-link anytime from the app.",
      }), { headers: { "Content-Type": "application/json" } });
    }

    // Update last_seen (fire and forget)
    admin.from("messaging_chat_bindings")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("channel", channel)
      .eq("chat_id", chat_id)
      .then(() => {});

    // Resolve role + language + guest phase
    const [{ data: roles }, { data: profile }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", binding.user_id),
      admin.from("profiles").select("preferred_language, full_name").eq("user_id", binding.user_id).maybeSingle(),
    ]);
    const role = deriveRole(roles ?? []);
    const langCode = profile?.preferred_language || "en";
    const langName = LANG_NAMES[langCode] || "English";
    const friendlyName = display_name || profile?.full_name || "there";
    const guestPhase = !isStaffRole(role) ? await getGuestPhase(admin, binding.user_id) : undefined;

    // Block guests with no booking
    if (!isStaffRole(role) && guestPhase === "none") {
      const reply = "I can't help until you have a booking confirmed. Front desk can assist.";
      await admin.from("messaging_inbound_log").insert({
        channel, chat_id, user_id: binding.user_id,
        inbound_text: trimmed.slice(0, 1000), outbound_text: reply, outcome: "guest_no_booking",
      });
      return new Response(JSON.stringify({ reply }), { headers: { "Content-Type": "application/json" } });
    }

    // /note <text> — staff only, capture-capable roles only
    const noteMatch = trimmed.match(/^\/?note\s+(.+)/is);
    if (noteMatch && canCapture(role)) {
      const noteText = noteMatch[1].trim().slice(0, 2000);
      const { data: lastBooking } = await admin
        .from("bookings")
        .select("id")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastBooking) {
        return new Response(JSON.stringify({
          reply: "No active booking found to attach the note to.",
        }), { headers: { "Content-Type": "application/json" } });
      }
      await admin.from("messages").insert({
        booking_id: lastBooking.id,
        sender_id: binding.user_id,
        content: `[via ${channel}] ${noteText}`,
        is_internal: true,
        draft: false,
      });
      await admin.from("messaging_inbound_log").insert({
        channel, chat_id, user_id: binding.user_id,
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

    // Slash commands (role-gated, returns null if not a recognized command for this role)
    if (isStaffRole(role)) {
      const cmdReply = await tryCommand(trimmed, role, admin, binding.user_id);
      if (cmdReply !== null) {
        await admin.from("messaging_inbound_log").insert({
          channel, chat_id, user_id: binding.user_id,
          inbound_text: trimmed.slice(0, 500),
          outbound_text: cmdReply.slice(0, 2000),
          outcome: "command",
        });
        return new Response(JSON.stringify({ reply: cmdReply }), { headers: { "Content-Type": "application/json" } });
      }
    }

    // ── Pull rolling thread memory (last 10 turns) ──
    const { data: memoryRows } = await admin
      .from("messaging_thread_memory")
      .select("role, content")
      .eq("user_id", binding.user_id)
      .eq("channel", channel)
      .order("created_at", { ascending: false })
      .limit(10);
    const history = (memoryRows ?? []).reverse() as { role: "user" | "assistant"; content: string }[];

    // Q&A path
    const context = await buildContext(admin, binding.user_id, role, guestPhase);
    const systemPrompt = buildSystemPrompt(role, langName, channel, friendlyName, guestPhase) + "\n\n" + context;
    const reply = await callAI(systemPrompt, history, trimmed, lovableApiKey);

    // Persist to thread memory (trimmed by trigger)
    await admin.from("messaging_thread_memory").insert([
      { user_id: binding.user_id, channel, role: "user", content: trimmed.slice(0, 1500) },
      { user_id: binding.user_id, channel, role: "assistant", content: reply.slice(0, 1500) },
    ]);

    await admin.from("messaging_inbound_log").insert({
      channel, chat_id, user_id: binding.user_id,
      inbound_text: trimmed.slice(0, 1000),
      outbound_text: reply.slice(0, 2000),
      outcome: "answered",
    });

    admin.from("security_events").insert({
      event_type: "ai_assistant_call",
      severity: "info",
      actor_id: binding.user_id,
      details: { source: `messaging-bridge:${channel}` },
    }).then(() => {});

    return new Response(JSON.stringify({ reply }), {
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
