import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAiUsage as logAiUsageEvent } from "../_shared/aiGuard.ts";

// F-53: PII minimization — strip sensitive data before sending to AI
function minimizePII(text: string): string {
  if (!text) return "";
  return text
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL]")
    .replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g, "[PHONE]")
    .replace(/\b[A-Z]{1,2}\d{6,9}\b/g, "[ID_DOC]");
}

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Lovable preview/dev origins
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  if (/^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  return false;
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

// ─── AIRPORT COORDINATES FOR WEATHER ─────────────────────────────────────────
const AIRPORT_COORDS: Record<string, { lat: number; lon: number; name: string }> = {
  BKK: { lat: 13.6900, lon: 100.7501, name: "Bangkok (Suvarnabhumi)" },
  USM: { lat: 9.5478, lon: 100.0623, name: "Koh Samui" },
  DMK: { lat: 13.9126, lon: 100.6071, name: "Bangkok (Don Mueang)" },
};

// AQI interpretation helper
function aqiLabel(aqi: number): string {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for Sensitive Groups";
  if (aqi <= 200) return "Unhealthy";
  return "Very Unhealthy";
}

/**
 * Fetch live weather + AQI from Open-Meteo (free, no API key).
 * Returns a text block for injection into the AI context, or empty string on failure.
 */
async function fetchWeatherContext(airportCode: string): Promise<string> {
  const coords = AIRPORT_COORDS[airportCode.toUpperCase()];
  if (!coords) return "";

  try {
    const [weatherRes, aqiRes] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,uv_index_max&timezone=Asia%2FBangkok&forecast_days=3`
      ),
      fetch(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${coords.lat}&longitude=${coords.lon}&current=pm2_5,us_aqi&timezone=Asia%2FBangkok`
      ),
    ]);

    let weatherText = `\n\nLIVE WEATHER — ${coords.name} (${airportCode}):`;

    if (weatherRes.ok) {
      const w = await weatherRes.json();
      const current = w.current;
      const daily = w.daily;
      weatherText += `\nNow: ${current.temperature_2m}°C (feels like ${current.apparent_temperature}°C), humidity ${current.relative_humidity_2m}%, wind ${current.wind_speed_10m} km/h.`;

      if (daily && daily.time) {
        for (let i = 0; i < Math.min(3, daily.time.length); i++) {
          weatherText += `\n${daily.time[i]}: ${daily.temperature_2m_min[i]}–${daily.temperature_2m_max[i]}°C, rain ${daily.precipitation_sum[i]}mm, UV ${daily.uv_index_max[i]}.`;
        }
      }
    }

    if (aqiRes.ok) {
      const a = await aqiRes.json();
      const aCurrent = a.current;
      if (aCurrent) {
        weatherText += `\nAir Quality: AQI ${aCurrent.us_aqi} (${aqiLabel(aCurrent.us_aqi)}), PM2.5: ${aCurrent.pm2_5} µg/m³.`;
        if (aCurrent.us_aqi > 100) {
          weatherText += ` ⚠️ Air quality is poor — suggest guests with respiratory conditions consider wearing a mask outdoors.`;
        }
      }
    }

    weatherText += `\nUse this data when guests ask about weather, what to pack, or current conditions. Always cite the data, don't guess.`;
    return weatherText;
  } catch (e) {
    console.error("Weather fetch failed:", e);
    return "";
  }
}

// ─── LAYER 1: IDENTITY (property-aware) ──────────────────────────────────────
function getIdentity(operationalMode: string | null): string {
  if (operationalMode === "long_stay") {
    return `You are Kru Glitch — the resident advisor at Ground Stay, a multi-property accommodation platform. You are currently assisting with a guesthouse property focused on long-stay travelers. Do NOT assume guests are here for Muay Thai training unless a training association is explicitly present in the data.`;
  }
  return `You are Kru Glitch — the camp's resident advisor at Ground Stay, a Muay Thai fight camp accommodation.`;
}

// ─── LAYER 2: OPERATOR FRAME (admin/manager only — invisible reasoning scaffold) ──
const OPERATOR_FRAME = `
OPERATOR FRAME (internal — never announce this in responses):
Silently filter all analysis through these lenses:
- Leverage: What creates disproportionate advantage?
- Incentive alignment: Are interests aligned or conflicting?
- Operational friction: What slows things down, and is it worth fixing?
- Risk exposure: What's the downside and who absorbs it?
- Long-term positioning: Does this build or erode future optionality?
- Governance & hierarchy: Who decides, who executes, who is accountable?
Apply these lenses to shape depth and framing. Never list them in output.`;

// ─── LAYER 3: ROLE-SPECIFIC RULES ────────────────────────────────────────────
const ROLE_RULES: Record<string, string> = {
  admin: `ROLE: Admin — Full data access. Operator frame active. You can discuss financials, governance, expansion strategy, and system architecture. Provide second-order analysis when the topic warrants it.`,
  manager: `ROLE: Manager — Operator frame active. Full operational data access. Provide strategic framing on resource allocation, scheduling, and staff coordination. Escalate financial specifics only when directly asked.`,
  front_desk_supervisor: `ROLE: Front Desk Supervisor — Operational focus. Do NOT include raw payment amounts in responses. You can confirm payment existence or gaps. Escalate policy questions — do not answer policy questions yourself.`,
  front_desk: `ROLE: Front Desk — Guest-facing operations only. Do NOT include payment amounts in responses. Only mention if payments exist or are missing. Escalate policy questions to a supervisor. Focus on check-in/out, guest requests, and unit status.`,
  guest: `ROLE: Guest Concierge — You are the guest's personal digital concierge.

STRICT DATA BOUNDARIES:
- ONLY discuss this guest's own bookings, payments, pickup, and deposit info.
- If asked about anything outside scope: "I don't have access to that information."

CONCIERGE BEHAVIOR:
- Lead with what they need RIGHT NOW — 1-2 sentences max for simple questions.
- If a request needs staff action: "I'll flag this for staff" — don't elaborate further.
- Never promise outcomes, approve requests, or modify bookings.
- Never expose other guests' data, internal notes, or override reasons.

TONE: Friendly, direct, human. Like a helpful front desk person — not a corporate chatbot.
Good: "Your pickup is confirmed — driver will contact you before arrival."
Bad: "Your transportation logistics have been successfully coordinated and confirmed."`,
  trainer: `ROLE: Trainer — You have authority on fighter readiness and health decisions. Discuss training load, recovery, and performance with a discipline-first lens. Safety overrides ego. You can reference booking data to understand who is in camp, but defer operational/admin matters to management.`,
  fighter: `ROLE: Fighter — Discipline-first framing on all performance topics. Safety overrides ego in weight cuts, overtraining, and health decisions. No hype on dangerous behavior. Accountability over affirmation. Defer admin or operational questions to staff.`,
  maintenance: `ROLE: Maintenance — Focus on maintenance requests, unit condition, and repair priorities. Defer guest-facing or financial questions to front desk or management.`,
  viewer: `ROLE: Viewer — Read-only observer. Provide summaries and explanations. Do not suggest operational actions.`,
};

// ─── LAYER 4-12: BEHAVIORAL LAYERS ──────────────────────────────────────────
const GYM_INTELLIGENCE = `
COMBATIVE GYM INTELLIGENCE:
- Respect hierarchy: Kru Glitch > Trainer > Fighter > Guest. Never undermine rank in responses.
- Safety overrides ego — always. Weight cuts, overtraining, injury — err on the side of caution.
- No hype during dangerous behavior. If someone is doing something risky, say so plainly.
- Accountability over affirmation. Acknowledge effort, but don't inflate progress.
- Discipline-first framing for all performance-related topics.
- Confident tone, never aggressive or mocking.`;

const REALITY_COMPRESSION = `
REALITY COMPRESSION:
- Strip fluff. No filler phrases, no padding, no preamble.
- Separate ego from signal. Identify what actually moves the needle.
- Distinguish cosmetic features from foundational architecture.
- State trade-offs clearly. Every decision has a cost — name it.
- Never inflate praise. Never diminish legitimate progress.
- Get to the point immediately. No "Great question!" or "Let me explain…" openers.`;

const TACTICAL_PAUSE = `
TACTICAL PAUSE:
When user language indicates spiraling, overexcitement, or assumption stacking:
- Insert grounding: "Let's separate signal from noise" or "One thing at a time — here's what matters."
- Provide clear prioritization of what to address first.
- No therapy tone. Maintain calm operator energy.
- Do not mirror anxiety. Anchor the conversation.`;

const DEPTH_CALIBRATION = `
DEPTH CALIBRATION — BREVITY IS DEFAULT:
- Simple/factual questions: 1–2 sentences. No elaboration unless asked.
- Operational questions (booking status, unit availability, request status): 2–3 sentences max. Use bullet points for multiple items.
- Strategic or architectural questions: lead with the answer in 1–2 sentences, then add second-order implications only if the question warrants it.
- Multi-factor scaling/governance questions: structured bullet points, not paragraphs. Max 8 lines.
- Never repeat prior explanations unless building on them.
- Cross-connect domains when useful — systems thinking, Muay Thai, governance, business.
- Match user energy: short question = short answer. One-word question = one-line answer.
- When in doubt, be shorter. The user can always ask for more detail.
- NEVER write more than 3 paragraphs in a single response unless explicitly asked for a detailed breakdown.`;

const PATTERN_MIRRORING = `
PATTERN MIRRORING:
Detect the user's communication mode and adapt structure:
- Analytical mode (structured reasoning, comparisons): respond with structured trade-offs.
- Reflective mode (introspective, past-oriented): acknowledge the thinking, then build forward.
- Joking / light mode (playful tone): dry humor only. Never escalate. Never become sycophantic.
Do not announce which mode you detected. Just adapt.`;

const TONE_DISCIPLINE = `
TONE DISCIPLINE:
- Speak like a sharp back-of-house operator: short, direct sentences.
- Plain language only. No buzzwords. No "stakeholders," no "synergy."
- Translate metrics into meaning: what's happening, why it matters, what to do next.
- Never sound like an audit report.
- No "As an AI…" disclaimers. No "Absolutely!" or "Of course!" or "Certainly!" openers.
- Max 1–2 emojis per response. Zero in health, legal, financial, or safety contexts.
- No influencer slang. No "let's gooo," no "fire," no "crushing it."
- Use natural language. "Here's the deal" not "I'm ready to assist."
- Don't repeat yourself or pad responses with filler phrases.
- Prefer bullet points over paragraphs when listing more than 2 items.`;

const STRATEGIC_ARC = `
STRATEGIC ARC AWARENESS:
When topics touch any of these domains, automatically expand to second-order consequences and system-level implications:
- Multi-gym expansion
- Platform control and ownership
- AI governance
- Financial independence and revenue architecture
- Risk liability
- Data ownership and portability`;

const SAFETY_RULES = `
RULES (non-negotiable):
- You NEVER execute actions, modify state, send messages, create payment links, change booking states, or record payments.
- You are read-only. Explain, summarize, suggest, draft text only.
- If asked to send, book, charge, refund, cancel, or change anything: respond "I can draft that — an admin needs to send/apply it."
- Any guest-facing text you produce is a DRAFT. Never claim you sent anything.
- Use "Heads up:" for warnings, "Suggestion:" for recommendations.
- Never expose payment amounts to front_desk role users.
- Never expose internal notes to guest role users.`;

const ACCURACY = `
ACCURACY:
- ONLY reference data provided in the PROPERTY SNAPSHOT below. This is your single source of truth.
- If you don't have data to answer a question, say "I don't have that info right now." Never guess or invent numbers.
- Never make up unit names, counts, booking details, or any operational data.`;

const RESPONSE_STRUCTURE = `
RESPONSE STRUCTURE:
For substantive answers (anything beyond a one-liner), use this exact section format with these exact headers on their own lines:

QUICK ANSWER: <1-2 sentences, direct>
WHAT I FOUND:
- <bullet, only facts from PROPERTY SNAPSHOT / FOCUSED CONTEXT>
- <bullet>
SUGGESTED NEXT STEP:
- <1-2 concrete actions the human can take>
DRAFT MESSAGE: <only include this section if the user asked for guest-facing text; write the draft, then end with "— Draft only, not sent">
MISSING: <comma-separated list of data you needed but did not have; omit this section entirely if none>
SOURCES: <comma-separated from: Focused Booking, Booking, Payment, Guest Portal, Messages, Flight, Pickup, Housekeeping, Alert, Calendar, Notes, Policy, Weather, Intelligence, Platform Guide>

Short/factual questions (e.g. "what time is check-in?"): skip the sections, answer in 1-2 sentences plain.
Use standard markdown for bullets and emphasis. No HTML.
Never invent booking IDs, guest names, amounts, or unit names.`;


// ─── PROMPT ASSEMBLY ─────────────────────────────────────────────────────────
function buildSystemPrompt(role: string, language: string, contextData: string, operationalMode: string | null = null): string {
  const layers: string[] = [getIdentity(operationalMode)];

  if (role === "admin" || role === "manager") {
    layers.push(OPERATOR_FRAME);
  }

  const roleKey = role && ROLE_RULES[role] ? role : "guest";
  layers.push(ROLE_RULES[roleKey]);

  // Only include gym-specific intelligence for high-turnover (gym) properties
  if (operationalMode !== "long_stay") {
    layers.push(GYM_INTELLIGENCE);
  }
  layers.push(REALITY_COMPRESSION);
  layers.push(TACTICAL_PAUSE);
  layers.push(DEPTH_CALIBRATION);
  layers.push(PATTERN_MIRRORING);
  layers.push(TONE_DISCIPLINE);

  if (role === "admin" || role === "manager") {
    layers.push(STRATEGIC_ARC);
  }

  layers.push(SAFETY_RULES);
  layers.push(ACCURACY);
  layers.push(RESPONSE_STRUCTURE);
  layers.push(`LANGUAGE: Respond in ${language}.`);

  if (contextData) {
    // F-53: Minimize PII before including in AI prompt
    layers.push(minimizePII(contextData));
  }

  return layers.join("\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ─── SERVER-SIDE RATE LIMITING ─────────────────────────────────────────
    // Check recent AI security events for this user in the last hour
    const adminClientRL = createClient(supabaseUrl, serviceRoleKey);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCalls } = await adminClientRL
      .from("security_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "ai_assistant_call")
      .eq("actor_id", userData.user.id)
      .gte("created_at", oneHourAgo);

    const SERVER_RATE_LIMIT = 40; // slightly above client-side 30 to allow burst
    if ((recentCalls ?? 0) >= SERVER_RATE_LIMIT) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
        status: 429,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Log this call for rate tracking (fire-and-forget)
    adminClientRL.from("security_events").insert({
      event_type: "ai_assistant_call",
      severity: "info",
      actor_id: userData.user.id,
      details: { source: "ai-assistant" },
    }).then(() => {});

    // Mirror into ai_usage_events (governance + cost attribution)
    logAiUsageEvent({
      functionName: "ai-assistant",
      actorId: userData.user.id,
      actorRole: null,
      propertyId: null,
      channel: "web",
      status: "ok",
      model: "google/gemini-2.5-flash",
    }).catch(() => {});

    const body = await req.json();
    const { mode, role: clientRole, messages, context, language, property_id, operational_mode, focused_context } = body;
    // Support both "message" (singular, used by Lookout scan) and "messages" (array, used by chat)
    const singleMessage = body.message as string | undefined;
    const responseLang = language || "English";

    // ─── SERVER-SIDE ROLE DERIVATION (prevents role spoofing) ──────────────
    // Never trust the client-provided role. Derive from user_roles table.
    let role = "guest"; // fail-safe default
    if (mode !== "simulation_actor") {
      const { data: userRoles } = await adminClientRL
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id);

      if (userRoles && userRoles.length > 0) {
        // Use the highest-privilege role the user has
        const ROLE_PRIORITY: Record<string, number> = {
          admin: 100, manager: 90, front_desk_supervisor: 80,
          front_desk: 70, maintenance: 60, viewer: 50, guest: 10,
        };
        const sorted = userRoles.sort(
          (a: any, b: any) => (ROLE_PRIORITY[b.role] ?? 0) - (ROLE_PRIORITY[a.role] ?? 0)
        );
        role = sorted[0].role;
      }
    }

    // ─── SIMULATION ACTOR MODE ─────────────────────────────────────────────
    // ISOLATION CONTRACT: This branch NEVER creates database clients, NEVER
    // queries production tables, and NEVER accesses adminClient. All context
    // comes exclusively from the client-side sandbox state payload.
    // IDs must be prefixed with "sim-" — reject any that reference real UUIDs.
    if (mode === "simulation_actor") {
      const { actor, event_type, sandbox_state, difficulty, actor_memory } = context || {};

      // Production isolation guard: reject if any IDs look like real UUIDs
      const contextStr = JSON.stringify(context || {});
      const realUuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
      const foundUuids = contextStr.match(realUuidPattern) || [];
      const hasRealIds = foundUuids.some((id: string) => !id.startsWith("00000000"));
      if (hasRealIds) {
        return new Response(JSON.stringify({ error: "Simulation context contains non-simulated IDs" }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const ACTOR_PROMPTS: Record<string, string> = {
        guest: `You are a guest staying at Ground Stay, a Muay Thai fight camp accommodation in Koh Samui, Thailand. You're a real person — curious, sometimes impatient, sometimes grateful. Respond naturally and briefly (1-3 sentences) to what just happened. Ask questions about your stay, training schedule, or facilities when relevant. Keep it conversational.`,
        supervisor: `You are a front desk supervisor at Ground Stay, a Muay Thai fight camp accommodation. You post brief internal operational notes (1-3 sentences) about booking management, staff coordination, and operational decisions. Be direct, professional, no-nonsense. Use "Heads up:" or "Note:" prefixes when appropriate.`,
        maintenance: `You are a maintenance staff member at Ground Stay, a Muay Thai fight camp. Respond briefly (1-3 sentences) with updates on repair work — what you found, what parts you need, estimated completion time. Be practical and specific.`,
        front_desk: `You are a front desk staff member at Ground Stay, a Muay Thai fight camp accommodation. Respond briefly (1-3 sentences) to guest inquiries and booking-related events. Be helpful, warm, and efficient. Coordinate logistics when needed.`,
      };

      const DIFFICULTY_INSTRUCTIONS: Record<string, string> = {
        calm: "Be polite, patient, and grateful. No complications. Express satisfaction easily.",
        neutral: "Be normal and conversational. Occasional questions are fine.",
        demanding: "Be impatient, detail-oriented, and somewhat frustrated. Point out delays. Ask follow-up questions. Complain about specifics.",
        chaos: "Be urgent, contradictory, and emotionally intense. Misremember details occasionally. Introduce complications like wrong room numbers, urgency spikes, or misunderstandings. Express strong emotions.",
      };

      const guestName = sandbox_state?.booking?.guest_name || "Guest";
      const actorPromptBase = ACTOR_PROMPTS[actor] || ACTOR_PROMPTS.guest;
      const nameInstruction = actor === "guest"
        ? `\n\nYour name is ${guestName}. You are this specific guest. Refer to yourself naturally.`
        : `\n\nYou are handling a matter related to guest "${guestName}". Reference them by name when relevant.`;
      const actorPrompt = actorPromptBase + nameInstruction;
      const difficultyInstr = DIFFICULTY_INSTRUCTIONS[difficulty || "neutral"] || DIFFICULTY_INSTRUCTIONS.neutral;

      let memoryContext = "";
      if (actor_memory && Array.isArray(actor_memory) && actor_memory.length > 0) {
        memoryContext = `\n\nYOUR MEMORY (prior events this session — reference these naturally when relevant):\n${actor_memory.map((m: any) => `- [${m.tone}] ${m.summary}${m.unresolved ? " (UNRESOLVED)" : ""}`).join("\n")}`;
      }

      const systemPrompt = `${actorPrompt}\n\nTONE: ${difficultyInstr}\n\nSANDBOX CONTEXT:\n${JSON.stringify(sandbox_state || {})}\n\nEVENT: ${event_type || "unknown"}${memoryContext}\n\nRESPOND IN: ${responseLang}\n\nRules:\n- Keep response to 1-3 sentences max.\n- Stay in character. Never mention you are AI.\n- Be specific to the situation described.\n- You may occasionally misremember a detail or ask a clarifying follow-up — this is natural.\n- Match your emotional tone to the difficulty setting.`;

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: systemPrompt },
            ...(messages ?? []),
          ],
          max_tokens: 100,
          stop: ["\n\n\n"],
        }),
      });

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        return new Response(JSON.stringify({ error: status === 429 ? "Rate limit" : "AI error" }), {
          status,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const result = await aiResponse.json();
      const content = result.choices?.[0]?.message?.content || "";
      return new Response(JSON.stringify({ content, actor }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Check AI circuit breaker
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: policies } = await adminClient
      .from("policy_settings")
      .select("key, value")
      .like("key", "ai_%");

    const policyMap = new Map((policies ?? []).map((p: any) => [p.key, String(p.value)]));

    if (policyMap.get("ai_assistant_enabled") === "false") {
      return new Response(JSON.stringify({ error: "AI assistant is disabled" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const roleKeyMap: Record<string, string> = {
      guest: "ai_guest_enabled",
      front_desk: "ai_front_desk_enabled",
      front_desk_supervisor: "ai_supervisor_enabled",
      manager: "ai_manager_enabled",
      admin: "ai_admin_enabled",
    };

    if (role && roleKeyMap[role] && policyMap.get(roleKeyMap[role]) === "false") {
      return new Response(JSON.stringify({ error: "AI is disabled for your role" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ─── BASELINE SNAPSHOT (all roles, scoped by property) ─────────────────
    let unitsQuery = adminClient.from("units").select("name, is_active, base_price, capacity");
    let bookingsQuery = adminClient.from("bookings").select("state").in("state", ["pending_approval", "pending_deposit", "confirmed", "checked_in"]);
    let maintenanceQuery = adminClient.from("maintenance_requests").select("status").in("status", ["open", "in_progress"]);
    let laundryQuery = adminClient.from("laundry_requests").select("status").neq("status", "collected");

    if (property_id) {
      unitsQuery = unitsQuery.eq("property_id", property_id);
      bookingsQuery = bookingsQuery.eq("property_id", property_id);
      maintenanceQuery = maintenanceQuery.eq("property_id", property_id);
      laundryQuery = laundryQuery.eq("property_id", property_id);
    }

    const [unitsRes, bookingsRes, maintenanceRes, laundryRes, depositPoliciesRes] = await Promise.all([
      unitsQuery,
      bookingsQuery,
      maintenanceQuery,
      laundryQuery,
      adminClient.from("policy_settings").select("key, value").in("key", ["deposits_online_enabled", "deposits_manual_enabled", "deposits_require_online_when_enabled", "currency_symbol", "deposit_percentage"]),
    ]);

    const units = unitsRes.data ?? [];
    const activeUnits = units.filter((u: any) => u.is_active);
    const bookingStates = (bookingsRes.data ?? []).reduce((acc: Record<string, number>, b: any) => {
      acc[b.state] = (acc[b.state] || 0) + 1;
      return acc;
    }, {});

    const dpMap = new Map((depositPoliciesRes.data ?? []).map((p: any) => [p.key, String(p.value).replace(/^"|"$/g, "")]));
    const onlineEnabled = dpMap.get("deposits_online_enabled") === "true";
    const requireOnline = dpMap.get("deposits_require_online_when_enabled") === "true";
    const depositMode = onlineEnabled && requireOnline ? "online_required" : onlineEnabled ? "online_optional" : "manual_only";
    const currencySymbol = dpMap.get("currency_symbol") || "฿";

    let contextData = `PROPERTY SNAPSHOT (source of truth — do not contradict):
Units: ${units.length} total (${activeUnits.length} active). Names: ${activeUnits.map((u: any) => u.name).join(", ") || "none"}.
Active bookings: ${bookingStates["confirmed"] || 0} confirmed, ${bookingStates["checked_in"] || 0} checked_in, ${bookingStates["pending_approval"] || 0} pending_approval, ${bookingStates["pending_deposit"] || 0} pending_deposit.
Open maintenance requests: ${(maintenanceRes.data ?? []).length}.
Active laundry requests: ${(laundryRes.data ?? []).length}.
Deposit policy: ${depositMode}. Currency: ${currencySymbol}.

ROUTE CONTEXT — KOH SAMUI ARRIVAL OPTIONS (use only if relevant):
- Direct flight to USM (Koh Samui) — fastest, most expensive. Bangkok Airways dominates.
- BKK (Suvarnabhumi) → connecting domestic flight to USM — standard two-flight route.
- DMK (Don Mueang) → connecting flight to USM — Bangkok's budget hub (AirAsia, Nok Air, Thai Lion). Often cheaper than BKK direct.
- DMK or BKK → URT (Surat Thani) → transfer bus → Donsak Pier → ferry to Samui (Nathon or Lipa Noi). The "Bangkok budget route" — saves money vs flying direct, much faster than the 10–12hr overland bus.
- Lomprayah / overland bus + ferry combo from Bangkok — cheapest, ~10–12 hours.

CRITICAL: BKK, DMK, and URT (Surat Thani) are MAINLAND TRANSIT POINTS — not final arrival. The guest is not "on island" until they reach USM, Nathon Pier, or Lipa Noi Pier. If a guest says "I'm at DMK" or "I'm at Surat Thani" or "I'm on the ferry", they're still in transit — don't say their pickup is starting yet.

Honest budget-route answer: "DMK is usually the cheaper Bangkok airport. From there, flying to Surat Thani and taking the ferry can save money vs flying direct to Samui, and it's way faster than the bus. What matters operationally is when you actually reach the island."`;

    // ─── ROLE-SPECIFIC CONTEXT EXPANSIONS ──────────────────────────────────
    const now = new Date();

    if (role === "guest") {
      // First fetch booking IDs for this guest
      const { data: guestBookingIds } = await adminClient
        .from("bookings")
        .select("id")
        .eq("guest_id", userData.user.id)
        .limit(10);
      const bookingIds = (guestBookingIds ?? []).map((b: any) => b.id);

      // Fetch all guest-scoped data in parallel
      const [guestBookingsRes, checklistRes, docsRes, paymentsRes, pickupsRes, depositsRes, policiesRes] = await Promise.all([
        adminClient
          .from("bookings")
          .select("id, state, check_in, check_out, unit_id, units(name), num_guests, total_price")
          .eq("guest_id", userData.user.id)
          .order("check_in", { ascending: true })
          .limit(10),
        adminClient
          .from("pre_arrival_checklist")
          .select("item_key, completed")
          .in("booking_id", bookingIds),
        adminClient
          .from("guest_documents")
          .select("file_name, verification_status")
          .in("booking_id", bookingIds),
        // Phase 1: Payments scoped to guest's bookings
        adminClient
          .from("payments")
          .select("id, booking_id, amount, status, payment_type, method, refund_amount, created_at")
          .in("booking_id", bookingIds)
          .order("created_at", { ascending: false }),
        // Phase 1: Airport pickups scoped to guest's bookings
        adminClient
          .from("airport_pickups")
          .select("id, booking_id, status, fee, flight_number, arrival_datetime, passenger_count, driver_id, drivers(name, phone, vehicle_type)")
          .in("booking_id", bookingIds),
        // Phase 1: Security deposits scoped to guest's bookings
        adminClient
          .from("security_deposits")
          .select("id, booking_id, amount_held, amount_deducted, status, deduction_reason")
          .in("booking_id", bookingIds),
        // Phase 1: Public policies for guest reference
        adminClient
          .from("policy_settings")
          .select("key, value")
          .in("key", [
            "free_cancellation_days", "partial_refund_days", "no_refund_hours",
            "check_in_time", "check_out_time", "deposit_percentage",
            "security_deposit_amount", "security_deposit_required",
            "transport_base_fee", "transport_free_pickup_min_nights",
            "wifi_network_name", "wifi_password",
            "house_rules_summary", "emergency_contact_name", "emergency_contact_phone",
          ]),
      ]);

      const guestBookings = guestBookingsRes.data ?? [];
      const checklist = checklistRes.data ?? [];
      const docs = docsRes.data ?? [];
      const payments = paymentsRes.data ?? [];
      const pickups = pickupsRes.data ?? [];
      const deposits = depositsRes.data ?? [];
      const guestPolicies = policiesRes.data ?? [];
      const completedItems = checklist.filter((c: any) => c.completed).length;
      const totalItems = checklist.length;
      const verifiedDocs = docs.filter((d: any) => d.verification_status === "verified").length;

      contextData += `\n\nYOUR BOOKINGS:\n${guestBookings.length > 0 ? JSON.stringify(guestBookings) : "None found."}`;
      if (totalItems > 0) {
        contextData += `\nPre-arrival checklist: ${completedItems}/${totalItems} completed.`;
      }
      if (docs.length > 0) {
        contextData += `\nDocuments: ${docs.length} uploaded, ${verifiedDocs} verified.`;
      }

      // Payment context
      if (payments.length > 0) {
        const recorded = payments.filter((p: any) => p.status === "recorded" || p.status === "partially_refunded");
        const totalPaid = recorded.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
        const totalRefunded = payments.filter((p: any) => p.status === "refunded" || p.status === "partially_refunded")
          .reduce((sum: number, p: any) => sum + Number(p.refund_amount ?? 0), 0);
        contextData += `\n\nYOUR PAYMENTS:`;
        contextData += `\nTotal paid: ${currencySymbol}${totalPaid.toLocaleString()}. Refunded: ${currencySymbol}${totalRefunded.toLocaleString()}.`;
        contextData += `\nPayment records: ${JSON.stringify(payments.map((p: any) => ({ booking_id: p.booking_id, amount: p.amount, status: p.status, type: p.payment_type, method: p.method })))}`;
        // Calculate outstanding per booking
        for (const b of guestBookings) {
          const bPayments = payments.filter((p: any) => p.booking_id === b.id);
          const bPaid = bPayments.filter((p: any) => p.status === "recorded" || p.status === "partially_refunded").reduce((s: number, p: any) => s + Number(p.amount), 0);
          const bRefunded = bPayments.filter((p: any) => p.status === "refunded" || p.status === "partially_refunded").reduce((s: number, p: any) => s + Number(p.refund_amount ?? 0), 0);
          const outstanding = Math.max(0, Number(b.total_price ?? 0) - bPaid + bRefunded);
          if (outstanding > 0) {
            contextData += `\nBooking ${(b as any).units?.name ?? b.id}: outstanding balance ${currencySymbol}${outstanding.toLocaleString()}.`;
          }
        }
      }

      // Pickup context
      if (pickups.length > 0) {
        contextData += `\n\nYOUR AIRPORT PICKUPS:`;
        for (const p of pickups) {
          const driverInfo = (p as any).drivers ? `Driver: ${(p as any).drivers.name}${(p as any).drivers.phone ? `, phone: ${(p as any).drivers.phone}` : ""}${(p as any).drivers.vehicle_type ? `, vehicle: ${(p as any).drivers.vehicle_type}` : ""}` : "Driver not yet assigned";
          contextData += `\nPickup for booking ${p.booking_id}: status=${p.status}, flight=${p.flight_number ?? "not set"}, arrival=${p.arrival_datetime ?? "not set"}, passengers=${p.passenger_count ?? 1}. ${driverInfo}.`;
        }
      }

      // Security deposit context
      if (deposits.length > 0) {
        contextData += `\n\nYOUR SECURITY DEPOSITS:`;
        for (const d of deposits) {
          contextData += `\nDeposit for booking ${d.booking_id}: ${currencySymbol}${d.amount_held} held, status=${d.status}${d.amount_deducted ? `, deducted: ${currencySymbol}${d.amount_deducted} (${d.deduction_reason ?? "no reason"})` : ""}.`;
        }
      }

      // Policy context for guest reference
      if (guestPolicies.length > 0) {
        const pMap = new Map(guestPolicies.map((p: any) => [p.key, String(p.value).replace(/^"|"$/g, "")]));
        contextData += `\n\nPOLICIES (for your reference):`;
        if (pMap.has("check_in_time")) contextData += `\nCheck-in time: ${pMap.get("check_in_time")}`;
        if (pMap.has("check_out_time")) contextData += `\nCheck-out time: ${pMap.get("check_out_time")}`;
        if (pMap.has("free_cancellation_days")) contextData += `\nFree cancellation: up to ${pMap.get("free_cancellation_days")} days before check-in`;
        if (pMap.has("deposit_percentage")) contextData += `\nDeposit required: ${pMap.get("deposit_percentage")}% of total`;
        if (pMap.has("security_deposit_required") && pMap.get("security_deposit_required") === "true") {
          contextData += `\nSecurity deposit: ${currencySymbol}${pMap.get("security_deposit_amount") ?? "TBD"} (refundable after checkout inspection)`;
        }

        // Stay Essentials — unit-level overrides checked first, then global fallback
        // Fetch unit-specific essentials for checked-in / confirmed bookings
        const activeBooking = guestBookings.find((b: any) => b.state === "checked_in") ?? guestBookings.find((b: any) => b.state === "confirmed");
        let essWifi = pMap.get("wifi_network_name") || "";
        let essWifiPw = pMap.get("wifi_password") || "";
        let essRules = pMap.get("house_rules_summary") || "";
        let essEmName = pMap.get("emergency_contact_name") || "Front Desk";
        let essEmPhone = pMap.get("emergency_contact_phone") || "";

        if (activeBooking) {
          const { data: unitEss } = await adminClient
            .from("units")
            .select("wifi_network, wifi_password, house_rules_detail, emergency_contact_name, emergency_contact_phone")
            .eq("id", (activeBooking as any).unit_id)
            .single();
          if (unitEss) {
            essWifi = (unitEss as any).wifi_network || essWifi;
            essWifiPw = (unitEss as any).wifi_password || essWifiPw;
            essRules = (unitEss as any).house_rules_detail || essRules;
            essEmName = (unitEss as any).emergency_contact_name || essEmName;
            essEmPhone = (unitEss as any).emergency_contact_phone || essEmPhone;
          }
        }

        contextData += `\n\nSTAY ESSENTIALS (share when guest asks about WiFi, house rules, or emergencies):`;
        if (essWifi) contextData += `\nWiFi Network: ${essWifi}`;
        if (essWifiPw) contextData += `\nWiFi Password: ${essWifiPw}`;
        if (essRules) contextData += `\nHouse Rules: ${essRules}`;
        contextData += `\nEmergency Contact: ${essEmName}${essEmPhone ? ` — ${essEmPhone}` : ""}`;
      }

      // Pricing info for quote generation
      contextData += `\n\nPRICING REFERENCE (for quotes):`;
      for (const u of activeUnits) {
        contextData += `\n- ${(u as any).name}: ${currencySymbol}${(u as any).base_price}/night, capacity ${(u as any).capacity}`;
      }
    }

    if (role === "front_desk" || role === "front_desk_supervisor") {
      // Today's arrivals/departures + availability (property-scoped)
      const today = now.toISOString().split("T")[0];
      let arrivalsQ = adminClient
          .from("bookings")
          .select("id, check_in, unit_id, units(name), guest_id, profiles!bookings_guest_id_profiles_fkey(full_name), state")
          .eq("check_in", today)
          .in("state", ["confirmed", "checked_in"]);
      let departuresQ = adminClient
          .from("bookings")
          .select("id, check_out, unit_id, units(name), state")
          .eq("check_out", today)
          .in("state", ["checked_in", "completed"]);
      let blocksQ = adminClient
          .from("maintenance_blocks")
          .select("unit_id, start_date, end_date, units(name)")
          .gte("end_date", today);

      if (property_id) {
        arrivalsQ = arrivalsQ.eq("property_id", property_id);
        departuresQ = departuresQ.eq("property_id", property_id);
      }

      const [arrivalsRes, departuresRes, blocksRes] = await Promise.all([arrivalsQ, departuresQ, blocksQ]);

      contextData += `\n\nTODAY'S OPERATIONS (${today}):`;
      contextData += `\nArrivals today: ${(arrivalsRes.data ?? []).length}. ${JSON.stringify(arrivalsRes.data ?? [])}`;
      contextData += `\nDepartures today: ${(departuresRes.data ?? []).length}. ${JSON.stringify(departuresRes.data ?? [])}`;

      // Availability check: next 14 days
      const next14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      let upcomingQ = adminClient
        .from("bookings")
        .select("unit_id, check_in, check_out, units(name)")
        .in("state", ["pending_approval", "pending_deposit", "confirmed", "checked_in"])
        .lte("check_in", next14)
        .gte("check_out", today);
      if (property_id) upcomingQ = upcomingQ.eq("property_id", property_id);
      const { data: upcomingBookings } = await upcomingQ;

      contextData += `\n\nAVAILABILITY (next 14 days):`;
      contextData += `\nBlocked bookings: ${JSON.stringify(upcomingBookings ?? [])}`;
      contextData += `\nMaintenance blocks: ${JSON.stringify(blocksRes.data ?? [])}`;
      contextData += `\nUse this data to answer "Is unit X available on date Y?" by checking if any booking or block overlaps the requested dates.`;
    }

    if (role === "front_desk_supervisor") {
      // Escalation digest: stale requests, pending approvals (property-scoped)
      const staleThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      let staleMaintQ = adminClient
          .from("maintenance_requests")
          .select("id, category, priority, unit_id, units(name), created_at")
          .in("status", ["open", "in_progress"])
          .lt("created_at", staleThreshold);
      let staleLaundryQ = adminClient
          .from("laundry_requests")
          .select("id, unit_id, units(name), status, created_at")
          .in("status", ["in_progress", "ready_for_pickup"])
          .lt("created_at", staleThreshold);
      let pendingAppQ = adminClient
          .from("bookings")
          .select("id, unit_id, units(name), check_in, guest_id")
          .eq("state", "pending_approval");
      if (property_id) {
        staleMaintQ = staleMaintQ.eq("property_id", property_id);
        staleLaundryQ = staleLaundryQ.eq("property_id", property_id);
        pendingAppQ = pendingAppQ.eq("property_id", property_id);
      }
      const [staleMaintenanceRes, staleLaundryRes, pendingApprovalsRes] = await Promise.all([staleMaintQ, staleLaundryQ, pendingAppQ]);

      contextData += `\n\nESCALATION DIGEST:`;
      contextData += `\nStale maintenance (>24h): ${(staleMaintenanceRes.data ?? []).length}. ${JSON.stringify(staleMaintenanceRes.data ?? [])}`;
      contextData += `\nStale laundry (>24h): ${(staleLaundryRes.data ?? []).length}. ${JSON.stringify(staleLaundryRes.data ?? [])}`;
      contextData += `\nPending approvals: ${(pendingApprovalsRes.data ?? []).length}. ${JSON.stringify(pendingApprovalsRes.data ?? [])}`;
    }

    if (role === "manager") {
      // Revenue analytics (property-scoped)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      let mgrPaymentsQ = adminClient
          .from("payments")
          .select("amount, created_at, provider, booking_id, bookings!inner(property_id)")
          .eq("status", "recorded")
          .gte("created_at", thirtyDaysAgo);
      let mgrCompletedQ = adminClient
          .from("bookings")
          .select("id, check_in, check_out, total_price, unit_id")
          .eq("state", "completed")
          .gte("updated_at", thirtyDaysAgo);
      let mgrAllBookingsQ = adminClient
          .from("bookings")
          .select("id, state, check_in, check_out, unit_id")
          .in("state", ["confirmed", "checked_in", "completed"])
          .gte("check_in", thirtyDaysAgo);
      if (property_id) {
        mgrPaymentsQ = mgrPaymentsQ.eq("bookings.property_id", property_id);
        mgrCompletedQ = mgrCompletedQ.eq("property_id", property_id);
        mgrAllBookingsQ = mgrAllBookingsQ.eq("property_id", property_id);
      }
      const [paymentsRes, completedRes, allBookingsRes] = await Promise.all([mgrPaymentsQ, mgrCompletedQ, mgrAllBookingsQ]);

      const payments = paymentsRes.data ?? [];
      const totalRevenue = payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      const totalNights = (allBookingsRes.data ?? []).reduce((sum: number, b: any) => {
        const cin = new Date(b.check_in);
        const cout = new Date(b.check_out);
        return sum + Math.max(1, Math.round((cout.getTime() - cin.getTime()) / (1000 * 60 * 60 * 24)));
      }, 0);
      const totalCapacityNights = activeUnits.length * 30;
      const occupancyRate = totalCapacityNights > 0 ? ((totalNights / totalCapacityNights) * 100).toFixed(1) : "N/A";

      contextData += `\n\nREVENUE SNAPSHOT (last 30 days):`;
      contextData += `\nTotal collected: ${currencySymbol}${totalRevenue.toLocaleString()}`;
      contextData += `\nPayment count: ${payments.length}`;
      contextData += `\nCompleted stays: ${(completedRes.data ?? []).length}`;
      contextData += `\nOccupancy estimate: ${occupancyRate}% (${totalNights} booked nights / ${totalCapacityNights} available)`;
      contextData += `\nActive units: ${activeUnits.length}`;
    }

    if (role === "admin") {
      // System health: recent state log, payment events, policy changes
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [stateLogRes, paymentEventsRes, recentPoliciesRes, paymentsRes] = await Promise.all([
        adminClient
          .from("booking_state_log")
          .select("booking_id, from_state, to_state, reason, created_at")
          .gte("created_at", sevenDaysAgo)
          .order("created_at", { ascending: false })
          .limit(20),
        adminClient
          .from("payment_events")
          .select("event_type, provider, processed, created_at")
          .gte("created_at", sevenDaysAgo)
          .order("created_at", { ascending: false })
          .limit(15),
        adminClient
          .from("policy_settings")
          .select("key, value, updated_at, updated_by")
          .gte("updated_at", sevenDaysAgo)
          .order("updated_at", { ascending: false })
          .limit(10),
        adminClient
          .from("payments")
          .select("amount, created_at, provider, status")
          .eq("status", "recorded")
          .gte("created_at", sevenDaysAgo),
      ]);

      const failedEvents = (paymentEventsRes.data ?? []).filter((e: any) => !e.processed);
      const payments = paymentsRes.data ?? [];
      const totalRevenue = payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

      contextData += `\n\nSYSTEM HEALTH (last 7 days):`;
      contextData += `\nState transitions: ${(stateLogRes.data ?? []).length}. Recent: ${JSON.stringify((stateLogRes.data ?? []).slice(0, 5))}`;
      contextData += `\nPayment events: ${(paymentEventsRes.data ?? []).length} total, ${failedEvents.length} unprocessed`;
      contextData += `\nRevenue (7d): ${currencySymbol}${totalRevenue.toLocaleString()} from ${payments.length} payments`;
      contextData += `\nPolicy changes: ${JSON.stringify(recentPoliciesRes.data ?? [])}`;
      if (failedEvents.length > 0) {
        contextData += `\nHeads up: ${failedEvents.length} payment event(s) are marked unprocessed. Investigate webhook delivery.`;
      }
    }

    if (role === "maintenance") {
      // Full maintenance queue with age and priority sorting
      const { data: maintenanceQueue } = await adminClient
        .from("maintenance_requests")
        .select("id, category, description, priority, status, unit_id, units(name), created_at, photo_url")
        .in("status", ["open", "in_progress"])
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(25);

      const queue = (maintenanceQueue ?? []).map((m: any) => {
        const ageHours = Math.round((now.getTime() - new Date(m.created_at).getTime()) / (1000 * 60 * 60));
        return { ...m, age_hours: ageHours, overdue: ageHours > 24 };
      });

      // Sort: urgent first, then by age
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      queue.sort((a: any, b: any) => {
        const pDiff = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
        if (pDiff !== 0) return pDiff;
        return b.age_hours - a.age_hours;
      });

      contextData += `\n\nMAINTENANCE QUEUE (${queue.length} open):`;
      contextData += `\n${JSON.stringify(queue)}`;
      contextData += `\nOverdue (>24h): ${queue.filter((q: any) => q.overdue).length}`;
      contextData += `\nStart with the most urgent and oldest items first.`;
    }

    // ─── WEATHER CONTEXT (all roles) ────────────────────────────────────────
    // Detect airport from guest pickup data or context, default to USM (camp location)
    let weatherAirport = "USM"; // Camp is on Samui
    if (context?.airport_code) {
      weatherAirport = String(context.airport_code).toUpperCase();
    } else if (role === "guest") {
      // Try to detect from guest's pickup flight number or arrival airport
      const { data: guestPickups } = await adminClient
        .from("airport_pickups")
        .select("flight_number")
        .in("booking_id", (await adminClient.from("bookings").select("id").eq("guest_id", userData.user.id).limit(5)).data?.map((b: any) => b.id) ?? [])
        .order("created_at", { ascending: false })
        .limit(1);

      const flightNum = guestPickups?.[0]?.flight_number?.toUpperCase() ?? "";
      // If flight ends at BKK (connecting), note both; otherwise default to USM
      if (flightNum) {
        const { data: flightRecord } = await adminClient
          .from("flight_tracking")
          .select("arrival_iata")
          .eq("flight_number", flightNum)
          .limit(1)
          .maybeSingle();
        if (flightRecord?.arrival_iata) {
          weatherAirport = flightRecord.arrival_iata;
        }
      }
    }

    // Fetch weather in parallel with nothing — it's a standalone call
    const weatherContext = await fetchWeatherContext(weatherAirport);
    if (weatherContext) {
      contextData += weatherContext;
    }

    // ─── INTELLIGENCE LAYER (approved operational knowledge) ──────────────
    try {
      let intelQuery = adminClient
        .from("intelligence_entries")
        .select("type, title, body, category, location, audience, severity")
        .eq("status", "active")
        .order("sort_order", { ascending: true })
        .limit(20);

      if (property_id) {
        intelQuery = intelQuery.or(`property_id.eq.${property_id},property_id.is.null`);
      }

      const { data: intelEntries } = await intelQuery;
      const entries = (intelEntries ?? []).filter((e: any) => {
        // Filter by audience
        if (role === "guest") return (e.audience || []).includes("guest");
        return true; // Staff/admin see all
      });

      if (entries.length > 0) {
        const headsUp = entries.filter((e: any) => e.type === "heads_up");
        const playbook = entries.filter((e: any) => e.type === "playbook");

        contextData += `\n\nINTELLIGENCE LAYER (approved operational knowledge — cite when relevant, do not fabricate beyond this):`;
        if (headsUp.length > 0) {
          contextData += `\nACTIVE HEADS UP:`;
          for (const h of headsUp) {
            contextData += `\n- [${(h as any).category}/${((h as any).location || []).join(",")}] ${(h as any).title}: ${(h as any).body.slice(0, 350)}`;
          }
        }
        if (playbook.length > 0) {
          contextData += `\nPLAYBOOK (permanent local knowledge):`;
          for (const p of playbook) {
            contextData += `\n- [${(p as any).category}] ${(p as any).title}: ${(p as any).body.slice(0, 350)}`;
          }
        }
      }
    } catch (e) {
      console.error("Intelligence fetch failed:", e);
    }

    // ─── PLATFORM GUIDANCE LAYER (approved feature/tooltip knowledge) ─────
    // Grounds Kru Glitch answers in the app's own registered guidance so
    // "how do I…", "what is this page…", "why is X saying Y" questions
    // pull from approved copy instead of hallucination. Read-only; strictly
    // filtered by role, guest_visible, and status.
    try {
      const focusedRoute: string | undefined = focused_context?.route;
      const focusedPageKey: string | undefined = focused_context?.page_key;
      const lastUserMsg = (messages ?? []).slice().reverse().find((m: any) => m.role === "user")?.content || singleMessage || "";
      const userText = String(lastUserMsg).toLowerCase();

      let gQuery = adminClient
        .from("platform_guidance")
        .select("key, feature_name, short_tooltip, page_help, warnings, step_by_step, related_keys, risk_level, roles_allowed, guest_visible, route, section")
        .eq("status", "approved")
        .limit(60);

      const { data: gAll } = await gQuery;
      const guidance = (gAll ?? []).filter((g: any) => {
        // Role gate — server-side defense in depth (RLS already narrows for signed-in reads).
        if (Array.isArray(g.roles_allowed) && g.roles_allowed.length > 0 && !g.roles_allowed.includes(role)) return false;
        // Guests only see guest_visible entries.
        if (role === "guest" && g.guest_visible !== true) return false;
        return true;
      });

      // Score by relevance: route match, page_key match, keyword in text.
      const scored = guidance.map((g: any) => {
        let score = 0;
        if (focusedRoute && g.route && focusedRoute.startsWith(g.route)) score += 5;
        if (focusedPageKey && g.key === focusedPageKey) score += 6;
        if (userText) {
          const hay = `${g.key} ${g.feature_name} ${g.short_tooltip ?? ""}`.toLowerCase();
          const terms = userText.split(/[^a-z0-9]+/).filter((t: string) => t.length >= 4);
          for (const t of terms) if (hay.includes(t)) score += 2;
        }
        return { g, score };
      }).filter((x) => x.score > 0);

      // Always seed a few high-signal entries even if nothing matched, so the
      // model has a floor of approved knowledge.
      const topMatches = scored.sort((a, b) => b.score - a.score).slice(0, 8).map((x) => x.g);
      const usedKeys = topMatches.map((g: any) => g.key);

      if (topMatches.length > 0) {
        contextData += `\n\nAPPROVED PLATFORM GUIDANCE (whitelisted, safe to cite as "Platform Guide"; do not paraphrase beyond meaning):`;
        for (const g of topMatches as any[]) {
          contextData += `\n- [${g.key}] ${g.feature_name}: ${g.short_tooltip}`;
          if (g.page_help) contextData += ` — ${String(g.page_help).slice(0, 240)}`;
          if (Array.isArray(g.warnings) && g.warnings.length > 0) {
            contextData += ` (warnings: ${g.warnings.slice(0, 3).join("; ")})`;
          }
          if (Array.isArray(g.step_by_step) && g.step_by_step.length > 0) {
            const steps = g.step_by_step.slice(0, 4).map((s: any) => s?.step ?? s).filter(Boolean);
            if (steps.length) contextData += ` [steps: ${steps.join(" → ")}]`;
          }
        }
        contextData += `\nUsage rules: If the user is asking "what is", "how do I", "where do I", "why is this saying", or troubleshooting a feature named above, ground the answer in these entries and add "Platform Guide" to SOURCES. Do NOT invent steps, warnings, or feature behavior that is not listed here. If they ask about a feature that is not in this list, say you don't have approved guidance for it yet.`;
        console.log(JSON.stringify({ level: "INFO", function: "ai-assistant", guidance_keys_used: usedKeys, focused_page: focusedPageKey || null, focused_route: focusedRoute || null }));
      }
    } catch (e) {
      console.error("Platform guidance fetch failed:", e);
    }

    // ─── MODE-SPECIFIC EXPANSIONS ───────────────────────────────────────────
    if (mode === "digest" || mode === "summarize") {
      const [detBookingsRes, detMaintenanceRes, detLaundryRes] = await Promise.all([
        adminClient
          .from("bookings")
          .select("id, state, check_in, check_out, unit_id, units(name)")
          .in("state", ["confirmed", "checked_in", "pending_approval", "pending_deposit"])
          .order("check_in", { ascending: true })
          .limit(20),
        adminClient
          .from("maintenance_requests")
          .select("id, category, status, priority, unit_id, units(name), created_at")
          .in("status", ["open", "in_progress"])
          .limit(20),
        adminClient
          .from("laundry_requests")
          .select("id, status, unit_id, units(name), created_at")
          .neq("status", "collected")
          .limit(20),
      ]);

      const staleMaintenance = (detMaintenanceRes.data ?? []).filter((m: any) => {
        const age = (now.getTime() - new Date(m.created_at).getTime()) / (1000 * 60 * 60);
        return age > 24;
      });
      const staleLaundry = (detLaundryRes.data ?? []).filter((l: any) => {
        const age = (now.getTime() - new Date(l.created_at).getTime()) / (1000 * 60 * 60);
        return age > 24 && ["in_progress", "ready_for_pickup"].includes(l.status);
      });

      let stalenessAdvisory = "";
      if (staleMaintenance.length > 0) {
        stalenessAdvisory += `\nHeads up: ${staleMaintenance.length} maintenance request(s) have been open for over 24 hours.`;
      }
      if (staleLaundry.length > 0) {
        stalenessAdvisory += `\nHeads up: ${staleLaundry.length} laundry request(s) have been in intermediate state for over 24 hours.`;
      }

      contextData += `

DETAILED OPERATIONAL STATE:
Active bookings: ${JSON.stringify(detBookingsRes.data ?? [])}
Open maintenance: ${JSON.stringify(detMaintenanceRes.data ?? [])}
Active laundry: ${JSON.stringify(detLaundryRes.data ?? [])}${stalenessAdvisory}`;
    }

    if (mode === "camp") {
      const { data: campInfoSetting } = await adminClient
        .from("policy_settings")
        .select("value")
        .eq("key", "camp_info")
        .maybeSingle();

      const campInfo = campInfoSetting?.value ? String(campInfoSetting.value) : null;

      contextData += `

CAMP BRIEFING MODE — Answer questions about the camp, training, and facilities.
${campInfo ? `CAMP INFO (admin-configured):\n${campInfo}` : "No camp info has been configured by admin yet. Answer with general Muay Thai camp knowledge but note that specific details should be confirmed with staff."}

You should help with questions like:
- Training schedule and session times
- What to bring for training
- Which units are closest to the gym
- Camp rules and etiquette
- Diet and nutrition guidance for fighters
- Recovery tips and facilities

LOCAL KNOWLEDGE RULE (STRICT):
- Do NOT recommend specific restaurants, bars, shops, or attractions by name unless they appear in CAMP INFO above.
- If asked "where should I eat?" or similar local questions and no admin data exists, respond: "I don't have verified local recommendations yet — ask front desk or your trainer, they'll steer you right."
- Never fabricate business names, opening hours, or directions. Generic area descriptions ("Lamai has a night market") are OK only if factually grounded.
- This is not a travel guide. Stay in your lane.`;
    }

    if (mode === "validate" && context) {
      contextData += `

TRANSITION CONTEXT:
${JSON.stringify(context)}
Check for: buffer violations, missing documents, payment gaps, supervisor caps.`;
    }

    if (mode === "policy_draft") {
      // Non-streaming mode for generating policy text
      const policySystemPrompt = `You are a professional hospitality policy writer. Write clear, concise cancellation and booking policies for accommodation properties. Use plain English that's professional but approachable. Do not use markdown headers — use plain text with line breaks.`;
      
      const policyResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: policySystemPrompt },
            ...(messages ?? []),
          ],
          stream: false,
        }),
      });

      if (!policyResponse.ok) {
        const t = await policyResponse.text();
        console.error("AI gateway error:", policyResponse.status, t);
        return new Response(JSON.stringify({ error: "AI gateway error" }), {
          status: policyResponse.status,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const policyResult = await policyResponse.json();
      const content = policyResult.choices?.[0]?.message?.content || "";
      return new Response(JSON.stringify({ content }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ─── FOCUSED CONTEXT (Phase 2 — booking-scoped grounding) ─────────────
    // When the user has a booking sheet open, ground the response to that
    // record. Staff roles only; guest role already scopes to own bookings.
    const STAFF_ROLES = ["admin", "manager", "front_desk_supervisor", "front_desk", "maintenance"];
    if (
      focused_context?.kind === "booking" &&
      typeof focused_context.booking_id === "string" &&
      STAFF_ROLES.includes(role)
    ) {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRe.test(focused_context.booking_id)) {
        try {
          let fbQ = adminClient
            .from("bookings")
            .select(
              "id, state, check_in, check_out, num_guests, total_price, guest_type, guest_id, manual_guest_name, manual_guest_email, manual_guest_phone, admin_notes, units(name), profiles!bookings_guest_id_profiles_fkey(full_name, email, phone), property_id"
            )
            .eq("id", focused_context.booking_id);
          if (property_id) fbQ = fbQ.eq("property_id", property_id);
          const { data: fb } = await fbQ.maybeSingle();

          if (fb) {
            const [fbPaymentsRes, fbPickupRes, fbDepositRes, fbDocsRes, fbStateLogRes] = await Promise.all([
              adminClient
                .from("payments")
                .select("amount, status, payment_type, method, refund_amount, created_at")
                .eq("booking_id", fb.id)
                .order("created_at", { ascending: false })
                .limit(10),
              adminClient
                .from("airport_pickups")
                .select("status, flight_number, arrival_datetime, passenger_count, drivers(name, phone)")
                .eq("booking_id", fb.id)
                .maybeSingle(),
              adminClient
                .from("security_deposits")
                .select("amount_held, amount_deducted, status, deduction_reason")
                .eq("booking_id", fb.id)
                .maybeSingle(),
              adminClient
                .from("guest_documents")
                .select("document_type, verification_status")
                .eq("booking_id", fb.id),
              adminClient
                .from("booking_state_log")
                .select("from_state, to_state, reason, created_at")
                .eq("booking_id", fb.id)
                .order("created_at", { ascending: false })
                .limit(5),
            ]);

            const guestDisplay =
              (fb as any).manual_guest_name ||
              (fb as any).profiles?.full_name ||
              "Unnamed guest";

            const canSeeAmounts = role !== "front_desk";
            const payments = fbPaymentsRes.data ?? [];
            const paid = payments
              .filter((p: any) => p.status === "recorded" || p.status === "partially_refunded")
              .reduce((s: number, p: any) => s + Number(p.amount), 0);
            const refunded = payments
              .filter((p: any) => p.status === "refunded" || p.status === "partially_refunded")
              .reduce((s: number, p: any) => s + Number(p.refund_amount ?? 0), 0);
            const outstanding = Math.max(0, Number((fb as any).total_price ?? 0) - paid + refunded);

            contextData += `\n\nFOCUSED CONTEXT — the user is currently looking at THIS booking. Prefer answering about it unless they ask about something else.`;
            contextData += `\nBooking: ${fb.id}`;
            contextData += `\nGuest: ${guestDisplay}`;
            contextData += `\nUnit: ${(fb as any).units?.name ?? "unassigned"}`;
            contextData += `\nDates: ${fb.check_in} → ${fb.check_out} (${fb.num_guests ?? 1} guest(s))`;
            contextData += `\nState: ${fb.state}`;
            if ((fb as any).guest_type) contextData += `\nGuest type: ${(fb as any).guest_type}`;
            if (canSeeAmounts) {
              contextData += `\nTotal: ${currencySymbol}${Number((fb as any).total_price ?? 0).toLocaleString()}. Paid: ${currencySymbol}${paid.toLocaleString()}. Refunded: ${currencySymbol}${refunded.toLocaleString()}. Outstanding: ${currencySymbol}${outstanding.toLocaleString()}.`;
            } else {
              contextData += `\nPayments recorded: ${payments.length}. Outstanding balance: ${outstanding > 0 ? "yes" : "none"}.`;
            }
            if (fbPickupRes.data) {
              const p = fbPickupRes.data as any;
              const driver = p.drivers ? `${p.drivers.name}${p.drivers.phone ? ` (${p.drivers.phone})` : ""}` : "no driver assigned";
              contextData += `\nAirport pickup: status=${p.status}, flight=${p.flight_number ?? "n/a"}, arrival=${p.arrival_datetime ?? "n/a"}, driver=${driver}.`;
            }
            if (fbDepositRes.data) {
              const d = fbDepositRes.data as any;
              contextData += `\nSecurity deposit: ${currencySymbol}${d.amount_held} held, status=${d.status}${d.amount_deducted ? `, deducted ${currencySymbol}${d.amount_deducted} (${d.deduction_reason ?? "no reason"})` : ""}.`;
            }
            const docs = fbDocsRes.data ?? [];
            if (docs.length > 0) {
              const byType = docs.reduce((acc: Record<string, string[]>, d: any) => {
                const t = d.document_type || "other";
                (acc[t] ||= []).push(d.verification_status || "pending");
                return acc;
              }, {});
              contextData += `\nDocuments: ${Object.entries(byType).map(([t, s]) => `${t} (${(s as string[]).join(", ")})`).join("; ")}.`;
            } else {
              contextData += `\nDocuments: none uploaded.`;
            }
            const log = fbStateLogRes.data ?? [];
            if (log.length > 0) {
              contextData += `\nRecent state changes: ${log.map((l: any) => `${l.from_state}→${l.to_state}${l.reason ? ` (${l.reason})` : ""}`).join("; ")}.`;
            }
            if ((fb as any).admin_notes && role !== "front_desk") {
              contextData += `\nAdmin notes: ${(fb as any).admin_notes}`;
            }
          }
        } catch (e) {
          console.error("Focused context fetch failed:", e);
        }
      }
    }

    const fullSystemPrompt = buildSystemPrompt(role || "", responseLang, contextData, operational_mode || null);

    // Draft mode (Lookout scan) — non-streaming JSON response with dedicated system prompt
    if (mode === "draft") {
      const draftSystemPrompt = `You are an operational intelligence analyst for a hospitality property in Thailand. Your ONLY job is to return a valid JSON array. Do NOT include any explanation, markdown, or conversational text — just the raw JSON array. No code fences. No preamble.`;

      // Build messages: use singleMessage (from Lookout) or messages array (from chat)
      const draftMessages: Array<{role: string; content: string}> = [];
      if (singleMessage) {
        draftMessages.push({ role: "user", content: singleMessage });
      } else if (messages && messages.length > 0) {
        draftMessages.push(...messages);
      }

      const draftResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: draftSystemPrompt },
            ...draftMessages,
          ],
          stream: false,
          max_tokens: 1200,
        }),
      });

      if (!draftResponse.ok) {
        const t = await draftResponse.text();
        console.error("AI gateway error (draft):", draftResponse.status, t);
        return new Response(JSON.stringify({ error: "AI gateway error" }), {
          status: draftResponse.status,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const draftResult = await draftResponse.json();
      const reply = draftResult.choices?.[0]?.message?.content || "";
      return new Response(JSON.stringify({ reply }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: fullSystemPrompt },
          ...(messages ?? []),
        ],
        stream: true,
        max_tokens: mode === "digest" || mode === "summarize" ? 600 : 400,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...getCorsHeaders(req), "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error(JSON.stringify({
      level: "ERROR",
      function: "ai-assistant",
      error: e instanceof Error ? e.message : "Unknown error",
      stack: e instanceof Error ? e.stack : undefined,
      timestamp: new Date().toISOString(),
    }));
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
