// payment-diagnostics
// Admin-only. Returns non-secret info about the Stripe integration state so
// the team can see whether the platform is on a test or live Stripe key,
// whether the webhook has ever succeeded, and how many payment_events have
// been processed. NEVER returns the raw key values.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return jsonResponse(req, { error: "unauthorized" }, 401);

  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse(req, { error: "unauthorized" }, 401);

  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .in("role", ["admin", "manager"])
    .maybeSingle();
  if (!roleRow) return jsonResponse(req, { error: "forbidden" }, 403);

  const { data: secretRows } = await admin
    .from("integration_secrets")
    .select("secret_key, encrypted_value")
    .in("secret_key", ["stripe_secret_key", "stripe_webhook_secret"]);

  let stripeMode: "test" | "live" | "unknown" | "not_configured" = "not_configured";
  let webhookSecretConfigured = false;
  for (const row of secretRows ?? []) {
    const v = String((row as any).encrypted_value ?? "");
    if ((row as any).secret_key === "stripe_secret_key" && v.length > 8) {
      if (v.startsWith("sk_live_")) stripeMode = "live";
      else if (v.startsWith("sk_test_")) stripeMode = "test";
      else stripeMode = "unknown";
    }
    if ((row as any).secret_key === "stripe_webhook_secret" && v.length > 8) {
      webhookSecretConfigured = true;
    }
  }

  const { data: health } = await admin
    .from("webhook_health")
    .select("last_success_at, last_failure_at, last_failure_reason, status, last_received_at, last_event_id")
    .eq("provider", "stripe")
    .maybeSingle();

  const { count: eventCount } = await admin
    .from("payment_events")
    .select("id", { count: "exact", head: true });

  const { count: recordedPayments } = await admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("provider", "stripe")
    .eq("status", "recorded");

  // Rough sanity: is our public domain likely live-mode-ready?
  const productionDomains = ["lmtcampstay.com", "www.lmtcampstay.com"];
  const originHint = req.headers.get("origin") || req.headers.get("referer") || "";
  const isProductionOrigin = productionDomains.some((d) => originHint.includes(d));

  return jsonResponse(req, {
    stripe_mode: stripeMode,
    webhook_secret_configured: webhookSecretConfigured,
    webhook_health: health ?? null,
    payment_events_count: eventCount ?? 0,
    recorded_stripe_payments: recordedPayments ?? 0,
    production_origin: isProductionOrigin,
    warnings: [
      ...(stripeMode === "test" && isProductionOrigin
        ? ["Stripe is in TEST mode but the request originated from a production domain — real card payments will NOT be captured."]
        : []),
      ...(!webhookSecretConfigured
        ? ["Stripe webhook signing secret (whsec_...) is not configured. Webhook events will be rejected."]
        : []),
      ...((eventCount ?? 0) === 0
        ? ["No Stripe webhook events have ever been processed. Verify the endpoint is registered in the Stripe dashboard and pointed at /functions/v1/payment-webhook."]
        : []),
      ...(!health?.last_success_at
        ? ["webhook_health has no successful delivery on record."]
        : []),
    ],
  });
});
