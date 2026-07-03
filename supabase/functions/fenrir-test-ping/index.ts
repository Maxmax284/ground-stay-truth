// Admin-only: send a real signed test event to Fenrir Lock and return the round-trip
// status + latency so operators can verify the outbound integration end-to-end.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(o: string) {
  if (ALLOWED_ORIGINS.includes(o)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(o)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(o)) return true;
  if (/^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/.test(o)) return true;
  return false;
}

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  const headers = { ...cors(req), "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers });
    }
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: user.id, _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Load config
    const { data: policies } = await admin
      .from("policy_settings")
      .select("key, value")
      .in("key", ["fenrir_enabled", "fenrir_endpoint"]);
    const map = new Map<string, string>(
      (policies ?? []).map((p: any) => [String(p.key), String(p.value).replace(/^"|"$/g, "")]),
    );
    const enabled = map.get("fenrir_enabled") === "true";
    const endpoint = map.get("fenrir_endpoint") || "";

    const { data: secret } = await admin
      .from("integration_secrets")
      .select("encrypted_value")
      .eq("secret_key", "fenrir_api_key")
      .maybeSingle();
    const apiKey = secret?.encrypted_value || Deno.env.get("FENRIR_API_KEY") || "";

    const missing: string[] = [];
    if (!enabled) missing.push("fenrir_enabled=false");
    if (!endpoint) missing.push("fenrir_endpoint");
    if (!apiKey) missing.push("fenrir_api_key");
    if (missing.length) {
      return new Response(JSON.stringify({
        ok: false, stage: "config", missing,
        message: "Fenrir outbound is not fully configured.",
      }), { status: 400, headers });
    }

    const environment =
      (Deno.env.get("FENRIR_ENVIRONMENT") as "staging" | "production") || "staging";
    const correlation_id = crypto.randomUUID();
    const envelope = {
      event_type: "system.integration_test",
      internal_event_type: "integration_test",
      severity: "info" as const,
      confidence_score: 100,
      source_platform: "groundstay",
      platform_version: "groundstay-1.0",
      environment,
      correlation_id,
      timestamp: new Date().toISOString(),
      details: {
        message: "Ground Truth Hub → Fenrir Lock ping",
        actor_role: "admin",
        triggered_from: "settings.integrations",
      },
    };

    const started = performance.now();
    let status = 0;
    let bodyText = "";
    let networkError: string | null = null;
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "x-groundstay-environment": environment,
          "x-groundstay-correlation-id": correlation_id,
        },
        body: JSON.stringify(envelope),
        signal: AbortSignal.timeout(10_000),
      });
      status = resp.status;
      bodyText = (await resp.text()).slice(0, 500);
    } catch (err) {
      networkError = (err as Error).message;
    }
    const duration_ms = Math.round(performance.now() - started);

    // Log locally regardless of outcome for the audit trail.
    await admin.from("security_events").insert({
      event_type: "fenrir_test_ping",
      severity: "info",
      actor_id: user.id,
      actor_role: "admin",
      confidence_score: 100,
      details: {
        correlation_id, endpoint, status, duration_ms,
        network_error: networkError, environment,
      },
    });

    const ok = !networkError && status >= 200 && status < 300;
    return new Response(JSON.stringify({
      ok,
      correlation_id,
      status,
      duration_ms,
      within_sla: duration_ms <= 10_000 && ok,
      environment,
      endpoint,
      response_preview: bodyText,
      network_error: networkError,
    }), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({
      ok: false, error: (err as Error).message,
    }), { status: 500, headers });
  }
});
