import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { FENRIR_EVENT_MAP, sendFenrirSecurityEvent } from "../_shared/fenrir.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { events } = await req.json();
    if (!Array.isArray(events) || events.length === 0) {
      return new Response(
        JSON.stringify({ error: "events array required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
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

    // Forward to Fenrir Lock through the mapper (dotted namespace + PII strip).
    // Unknown internal event names are rejected at the helper.
    let forwarded = 0;
    let forwardErrors = 0;
    let rejected = 0;
    const environment = (Deno.env.get("FENRIR_ENVIRONMENT") as "staging" | "production") || "staging";

    if (enabled && endpoint) {
      for (const event of events) {
        if (!FENRIR_EVENT_MAP[event.event_type]) {
          rejected++;
          continue;
        }
        const result = await sendFenrirSecurityEvent(
          {
            event_type: event.event_type,
            severity: event.severity,
            confidence_score: event.confidence_score,
            user_email: event.user_email,
            details: event.details ?? {},
            source_ip: event.source_ip,
            timestamp: event.timestamp,
          },
          { supabase, environment },
        );
        if (result.status === "sent") forwarded++;
        else if (result.status === "rejected") rejected++;
        else forwardErrors++;
      }
    }

    return new Response(
      JSON.stringify({
        logged: auditRows.length,
        forwarded,
        forward_errors: forwardErrors,
        fenrir_enabled: enabled,
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[fenrir-dispatch] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
