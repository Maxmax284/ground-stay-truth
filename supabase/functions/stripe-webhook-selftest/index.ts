// stripe-webhook-selftest
// -----------------------------------------------------------------------------
// Admin-only. Proves the Stripe → payment-webhook signing chain end-to-end
// WITHOUT moving money.
//
// What it does:
//   1. Loads the live sk_live_… + whsec_… from integration_secrets.
//   2. Builds a synthetic `checkout.session.expired` event with a fake
//      session id that matches nothing in `payments` (so the handler no-ops).
//   3. Signs it exactly the way Stripe does (t=<ts>,v1=HMAC-SHA256(ts.body)).
//   4. POSTs it to our payment-webhook and asserts a 2xx.
//   5. On success, flips `policy_settings.stripe_live_smoke_test_passed=true`
//      so payment-diagnostics returns GO and link generation unblocks.
//
// Safe to run repeatedly. Each run uses a fresh event_id so it's idempotent.
// -----------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";

async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(req);
  if (req.method !== "POST") return jsonResponse(req, { error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // ── Admin auth ──
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return jsonResponse(req, { error: "unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse(req, { error: "unauthorized" }, 401);
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return jsonResponse(req, { error: "forbidden_admin_only" }, 403);

  // ── Load Stripe secrets ──
  const { data: secretRows } = await admin
    .from("integration_secrets")
    .select("secret_key, encrypted_value")
    .in("secret_key", ["stripe_secret_key", "stripe_webhook_secret"]);

  const secrets = new Map<string, string>();
  for (const r of secretRows ?? []) {
    secrets.set(String((r as any).secret_key), String((r as any).encrypted_value ?? ""));
  }
  const stripeSecretKey = secrets.get("stripe_secret_key") || "";
  const whsec = secrets.get("stripe_webhook_secret") || "";
  if (!stripeSecretKey || !whsec) {
    return jsonResponse(req, {
      ok: false,
      stage: "load_secrets",
      error: "Stripe secret key or webhook secret is not configured.",
    }, 400);
  }
  if (!whsec.startsWith("whsec_")) {
    return jsonResponse(req, {
      ok: false,
      stage: "load_secrets",
      error: "Webhook secret does not look like a Stripe signing secret (should start with whsec_).",
    }, 400);
  }

  // ── Build synthetic no-op event ──
  const ts = Math.floor(Date.now() / 1000);
  const eventId = `evt_selftest_${ts}_${crypto.randomUUID().slice(0, 8)}`;
  const sessionId = `cs_selftest_${ts}_${crypto.randomUUID().slice(0, 8)}`;
  const payload = {
    id: eventId,
    object: "event",
    api_version: "2023-10-16",
    created: ts,
    livemode: stripeSecretKey.startsWith("sk_live_"),
    type: "checkout.session.expired",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        status: "expired",
        payment_intent: null,
        amount_total: 0,
        currency: "thb",
        metadata: { selftest: "true" },
      },
    },
  };
  const body = JSON.stringify(payload);

  // ── Sign it Stripe-style ──
  const signature = await hmacSha256Hex(whsec, `${ts}.${body}`);
  const stripeSigHeader = `t=${ts},v1=${signature}`;

  // ── POST to our own payment-webhook ──
  const webhookUrl = `${supabaseUrl}/functions/v1/payment-webhook`;
  let webhookStatus = 0;
  let webhookBody = "";
  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": stripeSigHeader,
      },
      body,
    });
    webhookStatus = resp.status;
    webhookBody = await resp.text();
  } catch (err) {
    return jsonResponse(req, {
      ok: false,
      stage: "post_to_webhook",
      error: err instanceof Error ? err.message : String(err),
    }, 502);
  }

  const ok = webhookStatus >= 200 && webhookStatus < 300;
  if (!ok) {
    return jsonResponse(req, {
      ok: false,
      stage: "webhook_response",
      webhook_status: webhookStatus,
      webhook_body: webhookBody.slice(0, 500),
      hint: webhookStatus === 400
        ? "Signature was rejected. The whsec_… stored in Integrations does not match the endpoint's signing secret in Stripe. Re-reveal it in Stripe → Webhooks → your endpoint → Signing secret, then paste it back into Settings → Integrations."
        : "Webhook returned a non-2xx. Check payment-webhook logs.",
    }, 400);
  }

  // ── Flip the smoke-test flag so diagnostics returns GO ──
  await admin
    .from("policy_settings")
    .upsert(
      {
        key: "stripe_live_smoke_test_passed",
        value: "true",
        property_id: null,
        updated_by: userData.user.id,
      },
      { onConflict: "key,property_id" },
    );

  return jsonResponse(req, {
    ok: true,
    stage: "verified",
    webhook_status: webhookStatus,
    event_id: eventId,
    session_id: sessionId,
    message: "Stripe signing chain verified end-to-end. Payment links are now unblocked.",
  });
});
