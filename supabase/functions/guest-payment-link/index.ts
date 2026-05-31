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

    // Check the booking hasn't already been paid through any other channel.
    const { data: paid } = await adminClient
      .from("payments")
      .select("id")
      .eq("booking_id", link.booking_id)
      .eq("status", "recorded")
      .limit(1);
    const alreadyPaid = !!(paid && paid.length > 0);

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
    };

    if (revoked) {
      await logEvent(adminClient, link.id, link.booking_id, "invalid_attempt", req, { reason: "revoked", action });
      return jsonResponse(req, { status: "revoked", summary }, 410);
    }
    if (expired) {
      await logEvent(adminClient, link.id, link.booking_id, "expired_attempt", req, { action });
      return jsonResponse(req, { status: "expired", summary }, 410);
    }
    if (alreadyPaid || booking.state !== "pending_deposit") {
      await logEvent(adminClient, link.id, link.booking_id, "already_paid_attempt", req, {
        booking_state: booking.state, action,
      });
      return jsonResponse(req, { status: "already_paid", summary }, 409);
    }
    if (used) {
      // Link was used but webhook hasn't completed payment yet. Surface this
      // as already_used so the guest doesn't pay twice.
      await logEvent(adminClient, link.id, link.booking_id, "already_paid_attempt", req, { reason: "used_at_set", action });
      return jsonResponse(req, { status: "already_used", summary }, 409);
    }

    if (action === "lookup") {
      await logEvent(adminClient, link.id, link.booking_id, "opened", req, {});
      return jsonResponse(req, { status: "ok", summary });
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

    // Mark link as used (locks it from a second checkout attempt).
    await adminClient
      .from("payment_links")
      .update({ used_at: new Date().toISOString(), used_session_id: session.id })
      .eq("id", link.id);

    // Insert pending payment so the existing webhook handler can transition it.
    await adminClient.from("payments").insert({
      booking_id: link.booking_id,
      amount: Number(link.amount),
      method: "card",
      status: "pending",
      payment_type: "deposit",
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
