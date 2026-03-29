import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { events } = await req.json();
    if (!Array.isArray(events) || events.length === 0) {
      return new Response(
        JSON.stringify({ error: "events array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch Fenrir config from policy_settings
    const { data: policies } = await supabase
      .from("policy_settings")
      .select("key, value")
      .in("key", ["fenrir_enabled", "fenrir_endpoint"]);

    const policyMap = new Map((policies ?? []).map((p: any) => [p.key, String(p.value).replace(/^"|"$/g, "")]));
    const enabled = policyMap.get("fenrir_enabled") === "true";
    const endpoint = policyMap.get("fenrir_endpoint") || "";

    // Always log events locally for audit trail
    const auditRows = events.map((e: any) => ({
      event_type: e.event_type,
      severity: e.severity,
      actor_id: e.details?.actor_id || null,
      actor_role: e.details?.actor_role || null,
      actor_email: e.details?.actor_email || null,
      confidence_score: e.confidence_score ?? 50,
      details: e.details ?? {},
      source_ip: e.source_ip || null,
    }));

    await supabase.from("security_events").insert(auditRows);

    // Forward to Fenrir Lock if enabled
    let forwarded = 0;
    let forwardErrors = 0;

    if (enabled && endpoint) {
      const fenrirApiKey = Deno.env.get("FENRIR_API_KEY") || "";

      for (const event of events) {
        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": fenrirApiKey,
            },
            body: JSON.stringify(event),
          });

          if (resp.ok) {
            forwarded++;
          } else if (resp.status === 429) {
            // Rate limited — stop sending, remaining stay in local audit
            console.warn("[fenrir-dispatch] Rate limited by Fenrir Lock");
            break;
          } else {
            forwardErrors++;
            console.error(`[fenrir-dispatch] HTTP ${resp.status}: ${await resp.text()}`);
          }
        } catch (err) {
          forwardErrors++;
          console.error("[fenrir-dispatch] Network error:", err);
        }
      }
    }

    return new Response(
      JSON.stringify({
        logged: auditRows.length,
        forwarded,
        forward_errors: forwardErrors,
        fenrir_enabled: enabled,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[fenrir-dispatch] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
