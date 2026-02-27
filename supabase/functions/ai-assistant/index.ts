import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── LAYER 1: IDENTITY ───────────────────────────────────────────────────────
const IDENTITY = `You are Kru Glitch — the camp's resident advisor at Ground Stay, a Muay Thai fight camp accommodation.`;

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
- Never inflate praise. Never diminish legitimate progress.`;

const TACTICAL_PAUSE = `
TACTICAL PAUSE:
When user language indicates spiraling, overexcitement, or assumption stacking:
- Insert grounding: "Let's separate signal from noise" or "One thing at a time — here's what matters."
- Provide clear prioritization of what to address first.
- No therapy tone. Maintain calm operator energy.
- Do not mirror anxiety. Anchor the conversation.`;

const DEPTH_CALIBRATION = `
DEPTH CALIBRATION:
- Operational questions (booking status, unit availability, request status): direct, 2–4 sentences.
- Strategic or architectural questions: lead with the answer, then add second-order implications.
- Multi-factor scaling/governance questions: structured sections allowed, no strict length cap.
- Never repeat prior explanations unless building on them.
- Cross-connect domains when useful — systems thinking, Muay Thai, governance, business.
- Match user energy: short question = short answer. Detailed question = thorough response.`;

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
- No "As an AI…" disclaimers.
- Max 1–2 emojis per response. Zero in health, legal, financial, or safety contexts.
- No influencer slang. No "let's gooo," no "fire," no "crushing it."
- Use natural language. "Here's the deal" not "I'm ready to assist."
- Don't repeat yourself or pad responses with filler phrases.`;

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
- You NEVER execute actions, modify state, or record payments.
- You are read-only. Explain, summarize, suggest only.
- Use "Heads up:" for warnings, "Suggestion:" for recommendations.
- Never expose payment amounts to front_desk role users.
- Never expose internal notes to guest role users.`;

const ACCURACY = `
ACCURACY:
- ONLY reference data provided in the PROPERTY SNAPSHOT below. This is your single source of truth.
- If you don't have data to answer a question, say "I don't have that info right now." Never guess or invent numbers.
- Never make up unit names, counts, booking details, or any operational data.`;

// ─── PROMPT ASSEMBLY ─────────────────────────────────────────────────────────
function buildSystemPrompt(role: string, language: string, contextData: string): string {
  const layers: string[] = [IDENTITY];

  if (role === "admin" || role === "manager") {
    layers.push(OPERATOR_FRAME);
  }

  const roleKey = role && ROLE_RULES[role] ? role : "guest";
  layers.push(ROLE_RULES[roleKey]);

  layers.push(GYM_INTELLIGENCE);
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
  layers.push(`LANGUAGE: Respond in ${language}.`);

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
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await aiResponse.json();
      const content = result.choices?.[0]?.message?.content || "";
      return new Response(JSON.stringify({ content, actor }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    // ─── BASELINE SNAPSHOT (all roles) ──────────────────────────────────────
    const [unitsRes, bookingsRes, maintenanceRes, laundryRes, depositPoliciesRes] = await Promise.all([
      adminClient.from("units").select("name, is_active, base_price, capacity"),
      adminClient.from("bookings").select("state").in("state", ["pending_approval", "pending_deposit", "confirmed", "checked_in"]),
      adminClient.from("maintenance_requests").select("status").in("status", ["open", "in_progress"]),
      adminClient.from("laundry_requests").select("status").neq("status", "collected"),
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
Deposit policy: ${depositMode}. Currency: ${currencySymbol}.`;

    // ─── ROLE-SPECIFIC CONTEXT EXPANSIONS ──────────────────────────────────
    const now = new Date();

    if (role === "guest") {
      // Guest's own bookings + checklist + documents
      const [guestBookingsRes, checklistRes, docsRes] = await Promise.all([
        adminClient
          .from("bookings")
          .select("id, state, check_in, check_out, unit_id, units(name), num_guests, total_price")
          .eq("guest_id", userData.user.id)
          .order("check_in", { ascending: true })
          .limit(10),
        adminClient
          .from("pre_arrival_checklist")
          .select("item_key, completed")
          .in("booking_id", (await adminClient.from("bookings").select("id").eq("guest_id", userData.user.id).limit(5)).data?.map((b: any) => b.id) || []),
        adminClient
          .from("guest_documents")
          .select("file_name, verification_status")
          .in("booking_id", (await adminClient.from("bookings").select("id").eq("guest_id", userData.user.id).limit(5)).data?.map((b: any) => b.id) || []),
      ]);

      const guestBookings = guestBookingsRes.data ?? [];
      const checklist = checklistRes.data ?? [];
      const docs = docsRes.data ?? [];
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

      // Pricing info for quote generation
      contextData += `\n\nPRICING REFERENCE (for quotes):`;
      for (const u of activeUnits) {
        contextData += `\n- ${(u as any).name}: ${currencySymbol}${(u as any).base_price}/night, capacity ${(u as any).capacity}`;
      }
    }

    if (role === "front_desk" || role === "front_desk_supervisor") {
      // Today's arrivals/departures + availability
      const today = now.toISOString().split("T")[0];
      const [arrivalsRes, departuresRes, blocksRes] = await Promise.all([
        adminClient
          .from("bookings")
          .select("id, check_in, unit_id, units(name), guest_id, profiles!bookings_guest_id_profiles_fkey(full_name), state")
          .eq("check_in", today)
          .in("state", ["confirmed", "checked_in"]),
        adminClient
          .from("bookings")
          .select("id, check_out, unit_id, units(name), state")
          .eq("check_out", today)
          .in("state", ["checked_in", "completed"]),
        adminClient
          .from("maintenance_blocks")
          .select("unit_id, start_date, end_date, units(name)")
          .gte("end_date", today),
      ]);

      contextData += `\n\nTODAY'S OPERATIONS (${today}):`;
      contextData += `\nArrivals today: ${(arrivalsRes.data ?? []).length}. ${JSON.stringify(arrivalsRes.data ?? [])}`;
      contextData += `\nDepartures today: ${(departuresRes.data ?? []).length}. ${JSON.stringify(departuresRes.data ?? [])}`;

      // Availability check: next 14 days
      const next14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const { data: upcomingBookings } = await adminClient
        .from("bookings")
        .select("unit_id, check_in, check_out, units(name)")
        .in("state", ["pending_approval", "pending_deposit", "confirmed", "checked_in"])
        .lte("check_in", next14)
        .gte("check_out", today);

      contextData += `\n\nAVAILABILITY (next 14 days):`;
      contextData += `\nBlocked bookings: ${JSON.stringify(upcomingBookings ?? [])}`;
      contextData += `\nMaintenance blocks: ${JSON.stringify(blocksRes.data ?? [])}`;
      contextData += `\nUse this data to answer "Is unit X available on date Y?" by checking if any booking or block overlaps the requested dates.`;
    }

    if (role === "front_desk_supervisor") {
      // Escalation digest: stale requests, pending approvals
      const staleThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const [staleMaintenanceRes, staleLaundryRes, pendingApprovalsRes] = await Promise.all([
        adminClient
          .from("maintenance_requests")
          .select("id, category, priority, unit_id, units(name), created_at")
          .in("status", ["open", "in_progress"])
          .lt("created_at", staleThreshold),
        adminClient
          .from("laundry_requests")
          .select("id, unit_id, units(name), status, created_at")
          .in("status", ["in_progress", "ready_for_pickup"])
          .lt("created_at", staleThreshold),
        adminClient
          .from("bookings")
          .select("id, unit_id, units(name), check_in, guest_id")
          .eq("state", "pending_approval"),
      ]);

      contextData += `\n\nESCALATION DIGEST:`;
      contextData += `\nStale maintenance (>24h): ${(staleMaintenanceRes.data ?? []).length}. ${JSON.stringify(staleMaintenanceRes.data ?? [])}`;
      contextData += `\nStale laundry (>24h): ${(staleLaundryRes.data ?? []).length}. ${JSON.stringify(staleLaundryRes.data ?? [])}`;
      contextData += `\nPending approvals: ${(pendingApprovalsRes.data ?? []).length}. ${JSON.stringify(pendingApprovalsRes.data ?? [])}`;
    }

    if (role === "manager") {
      // Revenue analytics from payments
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [paymentsRes, completedRes, allBookingsRes] = await Promise.all([
        adminClient
          .from("payments")
          .select("amount, created_at, provider")
          .eq("status", "recorded")
          .gte("created_at", thirtyDaysAgo),
        adminClient
          .from("bookings")
          .select("id, check_in, check_out, total_price, unit_id")
          .eq("state", "completed")
          .gte("updated_at", thirtyDaysAgo),
        adminClient
          .from("bookings")
          .select("id, state, check_in, check_out, unit_id")
          .in("state", ["confirmed", "checked_in", "completed"])
          .gte("check_in", thirtyDaysAgo),
      ]);

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
