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

  // Smoke-test override flag (admin can flip after a verified live payment)
  const { data: flagRow } = await admin
    .from("policy_settings")
    .select("value")
    .eq("key", "stripe_live_smoke_test_passed")
    .is("property_id", null)
    .maybeSingle();
  const smokeOk = !!flagRow && String(flagRow.value).replace(/^"|"$/g, "").toLowerCase() === "true";

  const reasons: string[] = [];
  if (stripeMode === "not_configured") reasons.push("Stripe secret key is not configured.");
  else if (stripeMode === "test") reasons.push("Stripe is still in TEST mode — install the sk_live_… key.");
  else if (stripeMode === "unknown") reasons.push("Stripe secret key format is not recognized as live or test.");
  if (!webhookSecretConfigured) reasons.push("Stripe webhook signing secret (whsec_…) is not configured.");
  if (!health?.last_success_at && !smokeOk) reasons.push("Live Stripe webhook has never verified a real payment — run the smoke test.");
  if (stripeMode === "test" && isProductionOrigin) reasons.push("Test mode is active on a production domain — real cards will NOT be captured.");

  const live_safe = reasons.length === 0;
  const status: "GO" | "NO_GO" = live_safe ? "GO" : "NO_GO";
  const next_action = live_safe
    ? "Ready to send payment links."
    : stripeMode !== "live"
      ? "Install a live sk_live_… key in Settings → Integrations → Stripe."
      : !webhookSecretConfigured
        ? "Register the live webhook in Stripe and paste the whsec_… into Settings → Integrations."
        : "Run a low-value live smoke-test payment to prove the webhook fires end-to-end.";

  return jsonResponse(req, {
    stripe_mode: stripeMode,
    webhook_secret_configured: webhookSecretConfigured,
    webhook_health: health ?? null,
    payment_events_count: eventCount ?? 0,
    recorded_stripe_payments: recordedPayments ?? 0,
    production_origin: isProductionOrigin,
    smoke_test_passed: smokeOk,
    live_safe,
    status,
    payment_links_blocked: !live_safe,
    next_action,
    warnings: reasons,
  });
});

