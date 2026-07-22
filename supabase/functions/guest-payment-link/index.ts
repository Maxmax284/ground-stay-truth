// guest-payment-link
// PUBLIC endpoint (no auth) that lets a guest:
//   action = "lookup"   -> validate token, return masked booking summary
//   action = "checkout" -> validate token, create Stripe Checkout session
//                          tied to THE EXACT booking + amount the token was
//                          minted for, and mark the link as used on completion
//                          (via existing webhook).
//
// Token is consumed only after a Stripe session is successfully created.
// Subsequent attempts return "already_used".
//
// All access patterns are logged to payment_link_events. The raw token is
// never logged — only its hash.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import {
  corsPreflight,
  jsonResponse,
  validateRedirectUrl,
  getCanonicalSiteUrl,
} from "../_shared/cors.ts";

const ATTEMPT_CAP = 12; // per-link lifetime cap on resolve attempts

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
async function hashToken(raw: string) { return sha256Hex(raw); }

function extractIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip");
}
async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  return (await sha256Hex(ip)).slice(0, 32);
}

async function logEvent(
  adminClient: any,
  linkId: string | null,
  bookingId: string | null,
  eventType: string,
  req: Request,
  extra: Record<string, any> = {},
) {
  try {
    const ipHash = await hashIp(extractIp(req));
    await adminClient.from("payment_link_events").insert({
      payment_link_id: linkId,
      booking_id: bookingId,
      event_type: eventType,
      actor_role: "guest",
      context: extra,
      ip_hash: ipHash,
      user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
    });
  } catch (err) {
    console.error("[guest-payment-link] log failed:", err);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "lookup");
    const rawToken = String(body.token || "").trim();
    if (!rawToken || rawToken.length < 20 || rawToken.length > 200) {
      return jsonResponse(req, { error: "invalid_token" }, 400);
    }
    if (!/^[A-Za-z0-9_-]+$/.test(rawToken)) {
      return jsonResponse(req, { error: "invalid_token" }, 400);
    }

    const tokenHash = await hashToken(rawToken);

    const { data: link } = await adminClient
      .from("payment_links")
      .select("*, bookings:booking_id(id, state, check_in, check_out, num_guests, total_price, unit_id, units(name))")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!link) {
      await logEvent(adminClient, null, null, "invalid_attempt", req, { action });
      return jsonResponse(req, { error: "invalid_token" }, 404);
    }

    // ── Abuse cap: increment lifetime attempt counter; lock once exceeded.
    const { data: newCount } = await adminClient.rpc("increment_payment_link_attempt", {
      _link_id: link.id,
    });
    if (link.abuse_locked_at || (typeof newCount === "number" && newCount > ATTEMPT_CAP)) {
      if (!link.abuse_locked_at) {
        await adminClient.rpc("lock_payment_link_abuse", {
          _link_id: link.id,
          _reason: `attempt_cap_exceeded:${newCount}`,
        });
        await logEvent(adminClient, link.id, link.booking_id, "abuse_locked", req, {
          attempt_count: newCount, cap: ATTEMPT_CAP, action,
        });
      } else {
        await logEvent(adminClient, link.id, link.booking_id, "locked_attempt", req, { action });
      }
      return jsonResponse(req, { error: "link_unavailable" }, 410);
    }

    const now = Date.now();
    const expired = new Date(link.expires_at).getTime() < now;
    const used = !!link.used_at;
    const revoked = !!link.revoked_at;

    const booking: any = (link as any).bookings;
    if (!booking) {
      await logEvent(adminClient, link.id, link.booking_id, "invalid_attempt", req, { reason: "missing_booking" });
      return jsonResponse(req, { error: "booking_missing" }, 404);
    }

    // Each link has a specific bucket (deposit | balance | full | security_deposit).
    // Block only when THAT bucket has already been settled — not when the booking
    // simply has other payments recorded against it.
    const linkCollect = String(((link as any).metadata?.collect) || "deposit");
    const linkPaymentType: string = ((link as any).metadata?.payment_type)
      || (linkCollect === "security_deposit" ? "security_deposit"
        : linkCollect === "balance" || linkCollect === "full" ? "balance"
        : "deposit");

    const { data: paidRowsForType } = await adminClient
      .from("payments")
      .select("amount, refund_amount, status")
      .eq("booking_id", link.booking_id)
      .eq("payment_type", linkPaymentType)
      .in("status", ["recorded", "partially_refunded"]);
    const paidNet = (paidRowsForType ?? []).reduce(
      (s: number, p: any) => s + Number(p.amount) - Number(p.refund_amount ?? 0),
      0,
    );
    // Tolerate rounding (1 unit). Bucket is "settled" once paidNet covers link.amount.
    const bucketSettled = paidNet + 1 >= Number(link.amount);

    // Allowed booking states depend on collection type
    const DEPOSIT_STATES = ["pending_deposit"];
    const POST_DEPOSIT_STATES = ["pending_deposit", "confirmed", "checked_in"];
    const allowedStates = linkCollect === "deposit" ? DEPOSIT_STATES : POST_DEPOSIT_STATES;
    const stateOk = allowedStates.includes(booking.state);

    // Common masked summary, never returns guest PII.
    const summary = {
      unit_name: booking.units?.name ?? "Accommodation",
      check_in: booking.check_in,
      check_out: booking.check_out,
      num_guests: booking.num_guests,
      amount: Number(link.amount),
      currency: link.currency,
      expires_at: link.expires_at,
      booking_state: booking.state,
      collect: linkCollect,
    };

    if (revoked) {
      await logEvent(adminClient, link.id, link.booking_id, "invalid_attempt", req, { reason: "revoked", action });
      return jsonResponse(req, { status: "revoked", summary }, 410);
    }
    if (expired) {
      await logEvent(adminClient, link.id, link.booking_id, "expired_attempt", req, { action });
      return jsonResponse(req, { status: "expired", summary }, 410);
    }
    if (bucketSettled || !stateOk) {
      await logEvent(adminClient, link.id, link.booking_id, "already_paid_attempt", req, {
        booking_state: booking.state, action, collect: linkCollect, bucket_settled: bucketSettled,
      });
      return jsonResponse(req, { status: "already_paid", summary }, 409);
    }
    if (used) {
      // `used_at` is now set ONLY after a verified paid webhook / verify call.
      // So this branch means the payment truly succeeded — surface as
      // already_paid, not already_used.
      await logEvent(adminClient, link.id, link.booking_id, "already_paid_attempt", req, { reason: "used_at_set", action });
      return jsonResponse(req, { status: "already_paid", summary }, 409);
    }

    // NEW: cheap polling endpoint the success page uses to tell truth from
    // the redirect. Returns whether the payment linked to this token has
    // been recorded yet. Never exposes the raw token.
    if (action === "status") {
      const sessionId = (link as any).checkout_session_id || (link as any).used_session_id;
      let paymentStatus: "recorded" | "pending" | "none" = "none";
      if (sessionId) {
        const { data: pay } = await adminClient
          .from("payments")
          .select("status")
          .eq("provider_session_id", sessionId)
          .maybeSingle();
        if (pay?.status === "recorded") paymentStatus = "recorded";
        else if (pay?.status === "pending") paymentStatus = "pending";
      }
      return jsonResponse(req, {
        status: "ok",
        payment_status: paymentStatus,
        checkout_started: !!(link as any).checkout_started_at,
        summary,
      });
    }

    if (action === "lookup") {
      await logEvent(adminClient, link.id, link.booking_id, "opened", req, {});
      return jsonResponse(req, { status: "ok", summary });
    }

    if (action === "verify") {
      // Fallback for when the Stripe webhook hasn't fired (e.g. webhook endpoint
      // not yet registered in Stripe dashboard, or signing secret mismatch).
      // Called from the success page right after Stripe redirects the guest back.
      const sessionId = (link as any).used_session_id;
      if (!sessionId) return jsonResponse(req, { status: "no_session" }, 200);

      const { data: secretRow2 } = await adminClient
        .from("integration_secrets")
        .select("encrypted_value")
        .eq("secret_key", "stripe_secret_key")
        .maybeSingle();
      const stripeSecret2 = secretRow2?.encrypted_value;
      if (!stripeSecret2 || stripeSecret2.length < 10) {
        return jsonResponse(req, { error: "Online payments not configured" }, 400);
      }
      const stripe2 = new Stripe(stripeSecret2, { apiVersion: "2023-10-16" });
      let session: any;
      try {
        session = await stripe2.checkout.sessions.retrieve(sessionId);
      } catch (e) {
        return jsonResponse(req, { status: "lookup_failed", error: String(e) }, 200);
      }
      if (session.payment_status !== "paid") {
        return jsonResponse(req, { status: "not_paid", payment_status: session.payment_status }, 200);
      }

      const amountPaid = (session.amount_total || 0) / 100;
      const transactionId = (session.payment_intent as string) || null;

      const { data: pendingPayment } = await adminClient
        .from("payments")
        .select("id, status")
        .eq("provider_session_id", sessionId)
        .maybeSingle();

      const alreadyRecorded = pendingPayment?.status === "recorded";
      if (pendingPayment && !alreadyRecorded) {
        await adminClient.from("payments").update({
          status: "recorded",
          provider_status: "completed",
          provider_transaction_id: transactionId,
        }).eq("id", pendingPayment.id).eq("status", "pending");
      } else if (!pendingPayment) {
        await adminClient.from("payments").insert({
          booking_id: link.booking_id,
          amount: amountPaid,
          method: "card",
          status: "recorded",
          payment_type: linkPaymentType,
          description: "Online payment (verified on return)",
          source_channel: "online",
          provider: "stripe",
          provider_transaction_id: transactionId,
          provider_session_id: sessionId,
          provider_status: "completed",
          idempotency_key: `stripe_${sessionId}`,
        });
      }

      if (booking.state === "pending_deposit") {
        const { error: transErr } = await adminClient
          .from("bookings")
          .update({ state: "confirmed" })
          .eq("id", link.booking_id)
          .eq("state", "pending_deposit");
        if (!transErr) {
          await adminClient.from("booking_state_log").insert({
            booking_id: link.booking_id,
            from_state: "pending_deposit",
            to_state: "confirmed",
            reason: `Online payment verified on guest return (${transactionId ?? sessionId})`,
          });
          if (booking.guest_id) {
            await adminClient.from("notifications").insert({
              user_id: booking.guest_id,
              type: "booking_confirmed",
              message: "Your deposit has been received and your booking is now confirmed!",
              reference_id: link.booking_id,
            });
          }
          const { data: admins } = await adminClient
            .from("user_roles").select("user_id").in("role", ["admin", "manager"]);
          const adminNotifs = (admins ?? []).map((a: any) => ({
            user_id: a.user_id,
            type: "booking",
            message: `Online deposit received (verified on return): ${amountPaid} — booking auto-confirmed`,
            reference_id: link.booking_id,
          }));
          if (adminNotifs.length) await adminClient.from("notifications").insert(adminNotifs);
          try {
            await fetch(`${supabaseUrl}/functions/v1/send-booking-confirmation`, {
              method: "POST",
              headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ booking_id: link.booking_id }),
            });
          } catch { /* ignore */ }
        }
      }

      await logEvent(adminClient, link.id, link.booking_id, "verified_on_return", req, {
        session_id: sessionId, amount: amountPaid, already_recorded: alreadyRecorded,
      });

      return jsonResponse(req, { status: "verified", amount: amountPaid });
    }

    if (action !== "checkout") {
      return jsonResponse(req, { error: "invalid_action" }, 400);
    }

    // ── Checkout flow ──
    const { data: secretRow } = await adminClient
      .from("integration_secrets")
      .select("encrypted_value")
      .eq("secret_key", "stripe_secret_key")
      .maybeSingle();
    const stripeSecret = secretRow?.encrypted_value;
    if (!stripeSecret || stripeSecret.length < 10) {
      return jsonResponse(req, { error: "Online payments not configured" }, 400);
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: "2023-10-16" });
    const site = getCanonicalSiteUrl();
    const successUrl =
      validateRedirectUrl(body.success_url) ||
      `${site}/pay/${rawToken}?status=success`;
    const cancelUrl =
      validateRedirectUrl(body.cancel_url) ||
      `${site}/pay/${rawToken}?status=cancelled`;

    const idempotencyKey = `paylink_${link.id}_${link.amount}`;

    const session = await stripe.checkout.sessions.create(
      {
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: link.currency,
              product_data: {
                name: `Deposit — ${summary.unit_name}`,
                description: `${summary.check_in} to ${summary.check_out}`,
              },
              unit_amount: Math.round(Number(link.amount) * 100),
            },
            quantity: 1,
          },
        ],
        metadata: {
          booking_id: link.booking_id,
          payment_link_id: link.id,
          idempotency_key: idempotencyKey,
          stay_description: `${summary.check_in} to ${summary.check_out}`,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
      { idempotencyKey },
    );

    // Record a SOFT checkout-started marker. This does NOT lock the link.
    // `used_at` is only set after webhook-verified payment success (or the
    // `verify` action's Stripe retrieve confirms `payment_status === paid`).
    // If the guest bounces off Stripe without paying, they can retry.
    await adminClient
      .from("payment_links")
      .update({
        checkout_started_at: new Date().toISOString(),
        checkout_session_id: session.id,
        used_session_id: session.id, // legacy readers (reconcile sweep, verify)
      })
      .eq("id", link.id);

    // Insert pending payment so the webhook handler can transition it.
    await adminClient.from("payments").insert({
      booking_id: link.booking_id,
      amount: Number(link.amount),
      method: "card",
      status: "pending",
      payment_type: linkPaymentType,
      description: `Deposit — payment link`,
      source_channel: "online",
      provider: "stripe",
      provider_session_id: session.id,
      provider_status: "pending",
      idempotency_key: idempotencyKey,
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    });

    await logEvent(adminClient, link.id, link.booking_id, "checkout_started", req, {
      session_id: session.id,
    });

    return jsonResponse(req, { url: session.url, session_id: session.id });
  } catch (err) {
    console.error("[guest-payment-link] error:", err);
    return jsonResponse(req, {
      error: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});
