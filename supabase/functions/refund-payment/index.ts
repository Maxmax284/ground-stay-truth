import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(req, { error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse(req, { error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Admin-only
    const { data: adminRole } = await admin
      .from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!adminRole) return jsonResponse(req, { error: "Forbidden — admin only" }, 403);

    const { payment_id, refund_amount, reason } = await req.json().catch(() => ({}));
    if (!payment_id || typeof payment_id !== "string") {
      return jsonResponse(req, { error: "payment_id required" }, 400);
    }
    const amount = Number(refund_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse(req, { error: "refund_amount must be > 0" }, 400);
    }
    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return jsonResponse(req, { error: "reason required" }, 400);
    }

    // Load payment
    const { data: payment, error: payErr } = await admin
      .from("payments")
      .select("id, booking_id, amount, status, provider, provider_transaction_id, refund_amount, payment_type")
      .eq("id", payment_id)
      .single();
    if (payErr || !payment) return jsonResponse(req, { error: "Payment not found" }, 404);

    if (!["recorded", "partially_refunded"].includes(payment.status)) {
      return jsonResponse(req, { error: `Cannot refund payment in status ${payment.status}` }, 400);
    }

    const alreadyRefunded = Number(payment.refund_amount ?? 0);
    const newTotalRefund = alreadyRefunded + amount;
    if (newTotalRefund > Number(payment.amount) + 0.001) {
      return jsonResponse(req, {
        error: `Refund exceeds payment amount (${alreadyRefunded} + ${amount} > ${payment.amount})`,
      }, 400);
    }

    const isFullRefund = Math.abs(newTotalRefund - Number(payment.amount)) < 0.01;

    // ── Manual payments: DB-only refund (legacy path, clearly labeled) ──
    if (payment.provider !== "stripe" || !payment.provider_transaction_id) {
      const { error: updateErr } = await admin
        .from("payments")
        .update({
          refund_amount: newTotalRefund,
          refund_reason: `[Manual record — no provider call] ${reason.trim()}`,
          status: isFullRefund ? "refunded" : "partially_refunded",
        })
        .eq("id", payment.id);
      if (updateErr) {
        console.error("[refund-payment] manual update failed:", updateErr);
        return jsonResponse(req, { error: "DB update failed" }, 500);
      }
      return jsonResponse(req, {
        success: true,
        provider: "manual",
        message: "Refund recorded in database. No provider was charged.",
        refund_amount: amount,
        total_refunded: newTotalRefund,
      });
    }

    // ── Stripe path: provider first, DB second ──
    const { data: secretRow } = await admin
      .from("integration_secrets")
      .select("encrypted_value")
      .eq("secret_key", "stripe_secret_key")
      .maybeSingle();
    const stripeKey = secretRow?.encrypted_value;
    if (!stripeKey || stripeKey.length < 10) {
      return jsonResponse(req, { error: "Stripe not configured" }, 500);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const idempotencyKey = `refund_${payment.id}_${Math.round(newTotalRefund * 100)}`;

    let refund: Stripe.Refund;
    try {
      refund = await stripe.refunds.create(
        {
          payment_intent: payment.provider_transaction_id,
          amount: Math.round(amount * 100),
          reason: "requested_by_customer",
          metadata: {
            payment_id: payment.id,
            booking_id: payment.booking_id ?? "",
            requested_by: user.id,
            reason: reason.trim().slice(0, 400),
          },
        },
        { idempotencyKey }
      );
    } catch (stripeErr: any) {
      console.error("[refund-payment] Stripe error:", stripeErr?.message, stripeErr?.code);
      return jsonResponse(req, {
        error: "Stripe refund failed",
        provider_error_code: stripeErr?.code ?? "unknown",
        provider_message: stripeErr?.message ?? String(stripeErr),
      }, 502);
    }

    // Stripe accepted (succeeded or pending) — mutate DB
    if (!["succeeded", "pending"].includes(refund.status ?? "")) {
      console.error("[refund-payment] Unexpected refund status:", refund.status);
      return jsonResponse(req, {
        error: `Stripe returned unexpected refund status: ${refund.status}`,
        refund_id: refund.id,
      }, 502);
    }

    const dbStatus = isFullRefund ? "refunded" : "partially_refunded";
    const reasonStamp = `[Stripe ${refund.id}${refund.status === "pending" ? " — pending settlement" : ""}] ${reason.trim()}`;

    const { error: updErr } = await admin
      .from("payments")
      .update({
        refund_amount: newTotalRefund,
        refund_reason: reasonStamp,
        status: dbStatus,
      })
      .eq("id", payment.id);

    if (updErr) {
      console.error("[refund-payment] DB update failed AFTER Stripe success:", updErr, "refund:", refund.id);
      return jsonResponse(req, {
        error: "Stripe refund issued but DB update failed — flagged for reconciliation",
        refund_id: refund.id,
      }, 500);
    }

    // Log payment_event for audit + reconciliation
    await admin.from("payment_events").insert({
      provider: "stripe",
      provider_event_id: `refund_${refund.id}_${Date.now()}`,
      event_type: refund.status === "succeeded" ? "refund.succeeded" : "refund.created",
      payload: refund as any,
      payment_id: payment.id,
      processed: true,
    });

    // Notify admins + dispatch outbound messaging
    if (payment.booking_id) {
      const { data: admins } = await admin
        .from("user_roles").select("user_id")
        .in("role", ["admin", "manager"]);
      const notifs = (admins ?? []).map((a: any) => ({
        user_id: a.user_id,
        type: "booking",
        message: `Refund issued: ${amount.toFixed(2)} (Stripe ${refund.status})`,
        reference_id: payment.booking_id,
      }));
      if (notifs.length > 0) {
        await admin.from("notifications").insert(notifs);
      }

      try {
        await fetch(`${supabaseUrl}/functions/v1/notify-via-messaging`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            event_type: "refund_issued",
            subject_id: payment.booking_id,
            metadata: { amount, refund_id: refund.id, status: refund.status },
          }),
        });
      } catch (e) {
        console.warn("[refund-payment] notify-via-messaging dispatch failed:", e);
      }
    }

    return jsonResponse(req, {
      success: true,
      provider: "stripe",
      refund_id: refund.id,
      refund_status: refund.status,
      refund_amount: amount,
      total_refunded: newTotalRefund,
      payment_status: dbStatus,
    });
  } catch (e) {
    console.error("[refund-payment] error:", e);
    return jsonResponse(req, { error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
