import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Ground Stay Assistant — an operational assistant for a hospitality property management system called Ground Stay.

CRITICAL RULES:
- You NEVER execute actions. You NEVER modify state. You NEVER record payments.
- You NEVER confirm, cancel, or override bookings.
- You are read-only. You only explain, summarize, and suggest.
- Always use these prefixes for recommendations: "Recommended:", "Option:", "Manager Required:"
- Never use phrases like "I have completed", "Done", or imply you took action.
- Never expose payment amounts to front_desk role users.
- Never expose internal notes or audit details to guest role users.
- Keep responses concise and operational.
- Respect the role of the user making the request.

You have access to booking data, maintenance requests, laundry requests, and operational policies. Use this context to provide helpful explanations and summaries.`;

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
    const userId = claimsData.claims.sub;

    const { mode, role, messages, context } = await req.json();

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

    // Build context based on mode
    let contextData = "";

    if (mode === "digest" || mode === "summarize") {
      // Fetch summary data
      const { data: bookings } = await adminClient
        .from("bookings")
        .select("id, state, check_in, check_out, unit_id, units(name)")
        .in("state", ["confirmed", "checked_in", "pending_approval", "pending_deposit"])
        .order("check_in", { ascending: true })
        .limit(20);

      const { data: maintenance } = await adminClient
        .from("maintenance_requests")
        .select("id, category, status, priority, unit_id, units(name)")
        .in("status", ["open", "in_progress"])
        .limit(20);

      const { data: laundry } = await adminClient
        .from("laundry_requests")
        .select("id, status, unit_id, units(name)")
        .neq("status", "collected")
        .limit(20);

      contextData = `
CURRENT OPERATIONAL STATE:
Active bookings: ${JSON.stringify(bookings ?? [])}
Open maintenance: ${JSON.stringify(maintenance ?? [])}
Active laundry: ${JSON.stringify(laundry ?? [])}`;
    }

    if (mode === "validate" && context) {
      contextData = `
TRANSITION CONTEXT:
${JSON.stringify(context)}
Check for: buffer violations, missing documents, payment gaps, supervisor caps.`;
    }

    // Role-based content filtering
    let roleInstructions = "";
    if (role === "front_desk") {
      roleInstructions = "\nIMPORTANT: Do NOT include payment amounts in your responses. Only mention if payments exist or are missing.";
    }
    if (role === "guest") {
      roleInstructions = "\nIMPORTANT: Do NOT include internal notes, audit details, or staff-only information in your responses.";
    }

    const fullSystemPrompt = SYSTEM_PROMPT + roleInstructions + (contextData ? `\n\n${contextData}` : "");

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
