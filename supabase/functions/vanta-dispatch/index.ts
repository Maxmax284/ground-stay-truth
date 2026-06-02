// Internal: signs and POSTs a single event envelope to the configured Vanta webhook.
// Service-role only — invoked from vanta-emit and vanta-test-event.
// Never throws into callers; logs every attempt to vanta_event_log.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SCHEMA_VERSION = "1.0";
const INTERNAL_TOKEN = Deno.env.get("VANTA_INTERNAL_TOKEN") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VANTA_SOURCE_ID = "ground_truth_hub";
const VANTA_OWNER_IDENTIFIER = "761b9440-c013-4b5a-a77a-53d826cd4329";

interface DispatchRequest {
  event_type: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  internal_token: string;
}

function summarize(payload: Record<string, unknown>): Record<string, unknown> {
  // Already small by convention. Truncate any long strings.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === "string" && v.length > 200) out[k] = v.slice(0, 200) + "…";
    else out[k] = v;
  }
  return out;
}

function resolveEnvelopeUserId(session: any): string | null {
  const ownerIdentifier = typeof session.vanta_owner_identifier === "string"
    ? session.vanta_owner_identifier.trim()
    : "";
  return ownerIdentifier || VANTA_OWNER_IDENTIFIER;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as DispatchRequest;
    if (!body.internal_token || body.internal_token !== INTERNAL_TOKEN) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.event_type || !body.payload || !body.idempotency_key) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: session } = await supabase
      .from("vanta_integration_session")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!session) {
      return new Response(JSON.stringify({ skipped: "no_session" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowed: string[] = Array.isArray(session.allowed_events) ? session.allowed_events : [];
    if (!session.enabled || !session.vanta_webhook_url || !allowed.includes(body.event_type)) {
      return new Response(JSON.stringify({ skipped: "disabled_or_not_allowed" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dedupe on idempotency_key
    const { data: existing } = await supabase
      .from("vanta_event_log")
      .select("id,status")
      .eq("idempotency_key", body.idempotency_key)
      .maybeSingle();
    if (existing && existing.status === "accepted") {
      return new Response(JSON.stringify({ skipped: "duplicate" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();

    const summary = summarize(body.payload);
    const envelopeUserId = resolveEnvelopeUserId(session);

    const sourceId = VANTA_SOURCE_ID;

    const envelope = {
      event_id: eventId,
      event_type: body.event_type,
      source_platform: session.platform_key,
      source_id: sourceId,
      environment: session.environment,
      user_id: envelopeUserId,
      identity_strategy: "vanta_owner",
      occurred_at: now,
      sent_at: now,
      idempotency_key: body.idempotency_key,
      schema_version: SCHEMA_VERSION,
      payload: body.payload,
    };

    const envelopeJson = JSON.stringify(envelope);

    const { data: secretRow } = await supabase.rpc("get_integration_secret", { _key: "vanta_webhook_secret" });
    const secret = (typeof secretRow === "string" ? secretRow : "") ?? "";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signatureHex = secret ? await hmacSha256Hex(secret, `${timestamp}.${envelopeJson}`) : "";
    const signature = signatureHex ? `sha256=${signatureHex}` : "";

    await supabase.from("vanta_event_log").upsert({
      event_id: eventId,
      event_type: body.event_type,
      direction: "outbound_to_vanta",
      status: "queued",
      payload_summary: summary,
      idempotency_key: body.idempotency_key,
    }, { onConflict: "idempotency_key" });

    // Retry network/5xx with backoff
    let attempt = 0;
    let responseCode = 0;
    let responseBody = "";
    let lastError = "";

    while (attempt < 3) {
      try {
        const res = await fetch(session.vanta_webhook_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Vanta-Signature": signature,
            "X-Vanta-Timestamp": timestamp,
            "X-Vanta-Source": sourceId,
            "X-Vanta-Event-Id": eventId,
            "X-Vanta-Owner": envelopeUserId,
          },
          body: envelopeJson,
        });
        responseCode = res.status;
        responseBody = (await res.text()).slice(0, 500);
        if (res.ok) break;
        if (res.status < 500) break; // do not retry 4xx
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
      attempt++;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }

    const ok = responseCode >= 200 && responseCode < 300;
    const status = ok ? "accepted" : responseCode > 0 ? "rejected" : "failed";

    await supabase.from("vanta_event_log").update({
      status,
      sent_at: new Date().toISOString(),
      accepted_at: ok ? new Date().toISOString() : null,
      failed_at: ok ? null : new Date().toISOString(),
      retry_count: attempt,
      vanta_response_code: responseCode || null,
      error_summary: ok ? null : (lastError || responseBody).slice(0, 500),
    }).eq("idempotency_key", body.idempotency_key);

    await supabase.from("vanta_integration_session").update({
      last_event_sent_at: new Date().toISOString(),
      last_success_at: ok ? new Date().toISOString() : session.last_success_at,
      // On success, fully clear stale failure state so the UI stops yelling.
      last_failure_at: ok ? null : new Date().toISOString(),
      failure_count: ok ? 0 : (session.failure_count ?? 0) + 1,
      last_error_summary: ok ? null : (lastError || responseBody).slice(0, 500),
      last_response_code: responseCode || null,
      last_response_snippet: responseBody ? responseBody.slice(0, 500) : null,
      last_event_id: eventId,
      status: ok ? "live" : "error",
    }).eq("id", session.id);

    return new Response(JSON.stringify({ ok, status, event_id: eventId, response_code: responseCode }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "dispatch_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
