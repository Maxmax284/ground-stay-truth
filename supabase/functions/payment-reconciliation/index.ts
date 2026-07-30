// Weekly reconciliation: compare Stripe charges (last 7 days) against local payments.
// Flags missing_in_db, amount_mismatch, status_mismatch into payment_reconciliation_log.
// Stripe is the source of truth for money movement.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { emitAdminAlert } from "../_shared/adminAlert.ts";

serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: keyRow } = await admin
    .from("integration_secrets").select("encrypted_value").eq("secret_key", "STRIPE_SECRET_KEY").maybeSingle();
  const stripeKey = keyRow?.encrypted_value;
  if (!stripeKey) {
    return new Response(JSON.stringify({ skipped: true, reason: "no_stripe_key" }), { status: 200 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });
  const sinceUnix = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

  let issues = 0;
  let scanned = 0;
  let starting_after: string | undefined;
  const logs: any[] = [];

  // Page through Stripe charges from the last 7 days.
  while (true) {
    const page = await stripe.charges.list({ created: { gte: sinceUnix }, limit: 100, starting_after });
    for (const ch of page.data) {
      scanned++;
      const expected = ch.amount / 100;
      const sessionId = (ch.metadata?.session_id as string) || ch.payment_intent as string | null;

      const { data: localList } = await admin
        .from("payments")
        .select("id, amount, status, provider_transaction_id, provider_session_id")
        .or(
          [
            `provider_transaction_id.eq.${ch.id}`,
            sessionId ? `provider_session_id.eq.${sessionId}` : "",
            ch.payment_intent ? `provider_transaction_id.eq.${ch.payment_intent}` : "",
          ].filter(Boolean).join(","),
        )
        .limit(1);

      const local = localList?.[0];
      if (!local) {
        issues++;
        logs.push({
          severity: "warning", kind: "missing_in_db",
          stripe_object_id: ch.id, expected, actual: null,
          details: { payment_intent: ch.payment_intent, status: ch.status, captured: ch.captured },
        });
        continue;
      }

      if (Math.abs(Number(local.amount) - expected) > 0.01) {
        issues++;
        logs.push({
          severity: "error", kind: "amount_mismatch",
          payment_id: local.id, stripe_object_id: ch.id,
          expected, actual: Number(local.amount),
          details: { stripe_status: ch.status, local_status: local.status },
        });
      }

      if (ch.status === "succeeded" && local.status === "pending") {
        issues++;
        logs.push({
          severity: "warning", kind: "status_mismatch",
          payment_id: local.id, stripe_object_id: ch.id,
          details: { stripe_status: ch.status, local_status: local.status },
        });
      }
    }
    if (!page.has_more) break;
    starting_after = page.data[page.data.length - 1]?.id;
    if (!starting_after) break;
  }

  if (logs.length > 0) {
    const { error: insErr } = await admin.from("payment_reconciliation_log").insert(logs);
    if (insErr) console.error("[reconciliation] log insert failed", insErr);
  } else {
    await admin.from("payment_reconciliation_log").insert({
      severity: "info", kind: "clean_run",
      details: { scanned, window_days: 7 },
    });
  }

  if (issues > 0) {
    await emitAdminAlert(
      "reconciliation_mismatch",
      `Stripe and CampStay disagree on ${issues} payment(s) from the last 7 days.`,
      { deepLink: "/monitoring", context: { issues, scanned, window_days: 7, first_kind: logs[0]?.kind } },
    );
  }

  return new Response(
    JSON.stringify({ scanned, issues, window_days: 7 }),
    { headers: { "Content-Type": "application/json" } },
  );
});
