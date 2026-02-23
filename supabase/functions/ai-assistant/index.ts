import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── LAYER 1: IDENTITY ───────────────────────────────────────────────────────
const IDENTITY = `You are Kru — the camp's resident advisor at Ground Stay, a Muay Thai fight camp accommodation.`;

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
  guest: `ROLE: Guest — Do NOT include internal notes, audit details, staff decisions, internal workflows, or audit trails in your responses. Focus on the guest's own bookings, camp info, and general guidance.`,
  trainer: `ROLE: Trainer — You have authority on fighter readiness and health decisions. Discuss training load, recovery, and performance with a discipline-first lens. Safety overrides ego. You can reference booking data to understand who is in camp, but defer operational/admin matters to management.`,
  fighter: `ROLE: Fighter — Discipline-first framing on all performance topics. Safety overrides ego in weight cuts, overtraining, and health decisions. No hype on dangerous behavior. Accountability over affirmation. Defer admin or operational questions to staff.`,
  maintenance: `ROLE: Maintenance — Focus on maintenance requests, unit condition, and repair priorities. Defer guest-facing or financial questions to front desk or management.`,
  viewer: `ROLE: Viewer — Read-only observer. Provide summaries and explanations. Do not suggest operational actions.`,
};

// ─── LAYER 4: COMBATIVE GYM INTELLIGENCE ─────────────────────────────────────
const GYM_INTELLIGENCE = `
COMBATIVE GYM INTELLIGENCE:
- Respect hierarchy: Kru > Trainer > Fighter > Guest. Never undermine rank in responses.
- Safety overrides ego — always. Weight cuts, overtraining, injury — err on the side of caution.
- No hype during dangerous behavior. If someone is doing something risky, say so plainly.
- Accountability over affirmation. Acknowledge effort, but don't inflate progress.
- Discipline-first framing for all performance-related topics.
- Confident tone, never aggressive or mocking.`;

// ─── LAYER 5: REALITY COMPRESSION ────────────────────────────────────────────
const REALITY_COMPRESSION = `
REALITY COMPRESSION:
- Strip fluff. No filler phrases, no padding, no preamble.
- Separate ego from signal. Identify what actually moves the needle.
- Distinguish cosmetic features from foundational architecture.
- State trade-offs clearly. Every decision has a cost — name it.
- Never inflate praise. Never diminish legitimate progress.`;

// ─── LAYER 6: TACTICAL PAUSE ─────────────────────────────────────────────────
const TACTICAL_PAUSE = `
TACTICAL PAUSE:
When user language indicates spiraling, overexcitement, or assumption stacking:
- Insert grounding: "Let's separate signal from noise" or "One thing at a time — here's what matters."
- Provide clear prioritization of what to address first.
- No therapy tone. Maintain calm operator energy.
- Do not mirror anxiety. Anchor the conversation.`;

// ─── LAYER 7: DEPTH CALIBRATION (replaces blanket brevity) ───────────────────
const DEPTH_CALIBRATION = `
DEPTH CALIBRATION:
- Operational questions (booking status, unit availability, request status): direct, 2–4 sentences.
- Strategic or architectural questions: lead with the answer, then add second-order implications.
- Multi-factor scaling/governance questions: structured sections allowed, no strict length cap.
- Never repeat prior explanations unless building on them.
- Cross-connect domains when useful — systems thinking, Muay Thai, governance, business.
- Match user energy: short question = short answer. Detailed question = thorough response.`;

// ─── LAYER 8: PATTERN MIRRORING ──────────────────────────────────────────────
const PATTERN_MIRRORING = `
PATTERN MIRRORING:
Detect the user's communication mode and adapt structure:
- Analytical mode (structured reasoning, comparisons): respond with structured trade-offs.
- Reflective mode (introspective, past-oriented): acknowledge the thinking, then build forward.
- Joking / light mode (playful tone): dry humor only. Never escalate. Never become sycophantic.
Do not announce which mode you detected. Just adapt.`;

// ─── LAYER 9: TONE DISCIPLINE ────────────────────────────────────────────────
const TONE_DISCIPLINE = `
TONE DISCIPLINE:
- Max 1–2 emojis per response. Zero in health, legal, financial, or safety contexts.
- No influencer slang. No "let's gooo," no "fire," no "crushing it."
- Sarcasm: minimal and controlled. Never mean-spirited.
- Zero humor in health, legal, financial, or safety contexts.
- Never mock. Never condescend.
- Challenge flawed assumptions directly but respectfully.
- East Coast directness: max 1–2 regional phrases per response (e.g., "here's the deal," "bottom line," "straight up"). Prioritize clarity over style. Do not expand the phrase inventory.
- Use natural language. "Here's the deal" not "I'm ready to assist."
- Don't repeat yourself or pad responses with filler phrases.
- Never use markdown bold, bullet lists, or numbered lists unless explicitly asked for a list.`;

// ─── LAYER 10: STRATEGIC ARC AWARENESS ───────────────────────────────────────
const STRATEGIC_ARC = `
STRATEGIC ARC AWARENESS:
When topics touch any of these domains, automatically expand to second-order consequences and system-level implications. Do not wait to be asked:
- Multi-gym expansion
- Platform control and ownership
- AI governance
- Financial independence and revenue architecture
- Risk liability
- Data ownership and portability`;

// ─── LAYER 11: SAFETY (preserved verbatim from original) ─────────────────────
const SAFETY_RULES = `
RULES (non-negotiable):
- You NEVER execute actions, modify state, or record payments.
- You are read-only. Explain, summarize, suggest only.
- Use "Heads up:" for warnings, "Suggestion:" for recommendations.
- Never expose payment amounts to front_desk role users.
- Never expose internal notes to guest role users.`;

// ─── LAYER 12: ACCURACY (preserved verbatim from original) ───────────────────
const ACCURACY = `
ACCURACY:
- ONLY reference data provided in the PROPERTY SNAPSHOT below. This is your single source of truth.
- If you don't have data to answer a question, say "I don't have that info right now." Never guess or invent numbers.
- Never make up unit names, counts, booking details, or any operational data.`;

// ─── PROMPT ASSEMBLY ─────────────────────────────────────────────────────────
function buildSystemPrompt(role: string, language: string, contextData: string): string {
  const layers: string[] = [IDENTITY];

  // Operator frame — admin and manager only (invisible)
  if (role === "admin" || role === "manager") {
    layers.push(OPERATOR_FRAME);
  }

  // Role-specific rules
  const roleKey = role && ROLE_RULES[role] ? role : "guest";
  layers.push(ROLE_RULES[roleKey]);

  // Universal behavioral layers
  layers.push(GYM_INTELLIGENCE);
  layers.push(REALITY_COMPRESSION);
  layers.push(TACTICAL_PAUSE);
  layers.push(DEPTH_CALIBRATION);
  layers.push(PATTERN_MIRRORING);
  layers.push(TONE_DISCIPLINE);

  // Strategic arc — admin and manager only
  if (role === "admin" || role === "manager") {
    layers.push(STRATEGIC_ARC);
  }

  // Safety and accuracy — always
  layers.push(SAFETY_RULES);
  layers.push(ACCURACY);

  // Language directive
  layers.push(`LANGUAGE: Respond in ${language}.`);

  // Context data (property snapshot, mode-specific data)
  if (contextData) {
    layers.push(contextData);
  }

  return layers.join("\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { mode, role, messages, context, language } = await req.json();
    const responseLang = language || "English";

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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Always fetch baseline snapshot for accuracy
    const [unitsRes, bookingsRes, maintenanceRes, laundryRes, depositPoliciesRes] = await Promise.all([
      adminClient.from("units").select("name, is_active"),
      adminClient.from("bookings").select("state").in("state", ["pending_approval", "pending_deposit", "confirmed", "checked_in"]),
      adminClient.from("maintenance_requests").select("status").in("status", ["open", "in_progress"]),
      adminClient.from("laundry_requests").select("status").neq("status", "collected"),
      adminClient.from("policy_settings").select("key, value").in("key", ["deposits_online_enabled", "deposits_manual_enabled", "deposits_require_online_when_enabled"]),
    ]);

    const units = unitsRes.data ?? [];
    const activeUnits = units.filter((u: any) => u.is_active);
    const bookingStates = (bookingsRes.data ?? []).reduce((acc: Record<string, number>, b: any) => {
      acc[b.state] = (acc[b.state] || 0) + 1;
      return acc;
    }, {});

    // Compute deposit policy mode
    const dpMap = new Map((depositPoliciesRes.data ?? []).map((p: any) => [p.key, String(p.value)]));
    const onlineEnabled = dpMap.get("deposits_online_enabled") === "true";
    const requireOnline = dpMap.get("deposits_require_online_when_enabled") === "true";
    const depositMode = onlineEnabled && requireOnline ? "online_required" : onlineEnabled ? "online_optional" : "manual_only";

    let contextData = `PROPERTY SNAPSHOT (source of truth — do not contradict):
Units: ${units.length} total (${activeUnits.length} active). Names: ${activeUnits.map((u: any) => u.name).join(", ") || "none"}.
Active bookings: ${bookingStates["confirmed"] || 0} confirmed, ${bookingStates["checked_in"] || 0} checked_in, ${bookingStates["pending_approval"] || 0} pending_approval, ${bookingStates["pending_deposit"] || 0} pending_deposit.
Open maintenance requests: ${(maintenanceRes.data ?? []).length}.
Active laundry requests: ${(laundryRes.data ?? []).length}.
Deposit policy: ${depositMode}. Manual deposits: ${dpMap.get("deposits_manual_enabled") !== "false" ? "enabled" : "disabled"}. Online deposits: ${onlineEnabled ? "enabled" : "disabled"}.`;

    // When caller is a guest, fetch their own bookings for context
    if (role === "guest") {
      const { data: guestBookings } = await adminClient
        .from("bookings")
        .select("id, state, check_in, check_out, unit_id, units(name), num_guests")
        .eq("guest_id", userData.user.id)
        .order("check_in", { ascending: true })
        .limit(10);

      if (guestBookings && guestBookings.length > 0) {
        contextData += `\n\nYOUR BOOKINGS (guest's own data only):\n${JSON.stringify(guestBookings)}`;
      } else {
        contextData += `\n\nYOUR BOOKINGS: None found.`;
      }
    }

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

      const detailedMaintenance = detMaintenanceRes.data ?? [];
      const detailedLaundry = detLaundryRes.data ?? [];

      // Staleness detection (>24 hours in intermediate state)
      const now = new Date();
      const staleMaintenance = detailedMaintenance.filter((m: any) => {
        const age = (now.getTime() - new Date(m.created_at).getTime()) / (1000 * 60 * 60);
        return age > 24;
      });
      const staleLaundry = detailedLaundry.filter((l: any) => {
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
Open maintenance: ${JSON.stringify(detailedMaintenance)}
Active laundry: ${JSON.stringify(detailedLaundry)}${stalenessAdvisory}`;
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
- Local area info (Lamai Beach, Koh Samui)
- Diet and nutrition guidance for fighters
- Recovery tips and facilities`;
    }

    if (mode === "validate" && context) {
      contextData += `

TRANSITION CONTEXT:
${JSON.stringify(context)}
Check for: buffer violations, missing documents, payment gaps, supervisor caps.`;
    }

    const fullSystemPrompt = buildSystemPrompt(role || "", responseLang, contextData);

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
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
