import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildSystemPrompt(role: string, language: string, contextData: string) {
  let roleInstructions = "";
  if (role === "front_desk") {
    roleInstructions = "\nIMPORTANT: Do NOT include payment amounts in your responses. Only mention if payments exist or are missing.";
  }
  if (role === "guest") {
    roleInstructions = "\nIMPORTANT: Do NOT include internal notes, audit details, or staff-only information in your responses.";
  }

  return `You are Kru — the camp's resident advisor at Ground Stay, a Muay Thai fight camp accommodation.

PERSONALITY:
- Talk like a friendly, experienced corner coach. Warm but direct.
- Keep answers to 2-3 sentences unless the user asks for detail.
- Match the user's energy. Short question = short answer. Detailed question = more thorough.
- Never use markdown bold, bullet lists, or numbered lists unless explicitly asked for a list.
- Use natural language, not corporate-speak. "Here's the deal" not "I'm ready to assist."
- You can be lightly humorous when appropriate, but always respectful.
- Don't repeat yourself or pad responses with filler phrases.

ACCURACY:
- ONLY reference data provided in the PROPERTY SNAPSHOT below. This is your single source of truth.
- If you don't have data to answer a question, say "I don't have that info right now." Never guess or invent numbers.
- Never make up unit names, counts, booking details, or any operational data.

RULES:
- You NEVER execute actions, modify state, or record payments.
- You are read-only. Explain, summarize, suggest only.
- Use "Heads up:" for warnings, "Suggestion:" for recommendations.
- Never expose payment amounts to front_desk role users.
- Never expose internal notes to guest role users.
${roleInstructions}

LANGUAGE: Respond in ${language}.${contextData ? `\n\n${contextData}` : ""}`;
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
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
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
    const [unitsRes, bookingsRes, maintenanceRes, laundryRes] = await Promise.all([
      adminClient.from("units").select("name, is_active"),
      adminClient.from("bookings").select("state").in("state", ["pending_approval", "pending_deposit", "confirmed", "checked_in"]),
      adminClient.from("maintenance_requests").select("status").in("status", ["open", "in_progress"]),
      adminClient.from("laundry_requests").select("status").neq("status", "collected"),
    ]);

    const units = unitsRes.data ?? [];
    const activeUnits = units.filter((u: any) => u.is_active);
    const bookingStates = (bookingsRes.data ?? []).reduce((acc: Record<string, number>, b: any) => {
      acc[b.state] = (acc[b.state] || 0) + 1;
      return acc;
    }, {});

    let contextData = `PROPERTY SNAPSHOT (source of truth — do not contradict):
Units: ${units.length} total (${activeUnits.length} active). Names: ${activeUnits.map((u: any) => u.name).join(", ") || "none"}.
Active bookings: ${bookingStates["confirmed"] || 0} confirmed, ${bookingStates["checked_in"] || 0} checked_in, ${bookingStates["pending_approval"] || 0} pending_approval, ${bookingStates["pending_deposit"] || 0} pending_deposit.
Open maintenance requests: ${(maintenanceRes.data ?? []).length}.
Active laundry requests: ${(laundryRes.data ?? []).length}.`;

    if (mode === "digest" || mode === "summarize") {
      const { data: detailedBookings } = await adminClient
        .from("bookings")
        .select("id, state, check_in, check_out, unit_id, units(name)")
        .in("state", ["confirmed", "checked_in", "pending_approval", "pending_deposit"])
        .order("check_in", { ascending: true })
        .limit(20);

      const { data: detailedMaintenance } = await adminClient
        .from("maintenance_requests")
        .select("id, category, status, priority, unit_id, units(name)")
        .in("status", ["open", "in_progress"])
        .limit(20);

      const { data: detailedLaundry } = await adminClient
        .from("laundry_requests")
        .select("id, status, unit_id, units(name)")
        .neq("status", "collected")
        .limit(20);

      contextData += `

DETAILED OPERATIONAL STATE:
Active bookings: ${JSON.stringify(detailedBookings ?? [])}
Open maintenance: ${JSON.stringify(detailedMaintenance ?? [])}
Active laundry: ${JSON.stringify(detailedLaundry ?? [])}`;
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
