import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { getCorsHeaders, corsPreflight } from "../_shared/cors.ts";
import { recordWebhookEvent } from "../_shared/webhookHealth.ts";

// ── Provider Webhook Verifiers ──
interface NormalizedPaymentEvent {
  provider: string;
  eventType: string; // normalized: "payment.success", "payment.failed", "session.expired"
  providerEventId: string;
  bookingId: string | null;
  idempotencyKey: string | null;
  amountPaid: number;
  transactionId: string | null;
  receiptUrl: string | null;
  sessionId: string | null;
  rawPayload: any;
}

async function verifyAndNormalizeStripe(
  req: Request,
  body: string,
  stripeSecretKey: string,
  webhookSecret: string
): Promise<NormalizedPaymentEvent> {
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
  const signature = req.headers.get("stripe-signature");
  if (!signature) throw new Error("Missing stripe-signature header");

  const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

  // Normalize based on event type
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    return {
      provider: "stripe",
      eventType: "payment.success",
      providerEventId: event.id,
      bookingId: session.metadata?.booking_id || null,
      idempotencyKey: session.metadata?.idempotency_key || null,
      amountPaid: (session.amount_total || 0) / 100,
      transactionId: session.payment_intent as string | null,
      receiptUrl: (session as any).receipt_url || null,
      sessionId: session.id,
      rawPayload: event.data.object,
    };
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    return {
      provider: "stripe",
      eventType: "session.expired",
      providerEventId: event.id,
      bookingId: session.metadata?.booking_id || null,
      idempotencyKey: session.metadata?.idempotency_key || null,
      amountPaid: 0,
      transactionId: null,
      receiptUrl: null,
      sessionId: session.id,
      rawPayload: event.data.object,
    };
  }

  if (
    event.type === "payment_intent.payment_failed" ||
    event.type === "charge.failed"
  ) {
    const obj = event.data.object as any;
    return {
      provider: "stripe",
      eventType: "payment.failed",
      providerEventId: event.id,
      bookingId: obj.metadata?.booking_id || null,
      idempotencyKey: obj.metadata?.idempotency_key || null,
      amountPaid: 0,
      transactionId: obj.id || null,
      receiptUrl: null,
      sessionId: null,
      rawPayload: event.data.object,
    };
  }

  // Refund lifecycle events (async confirmations from Stripe)
  if (
    event.type === "charge.refunded" ||
    event.type === "refund.created" ||
    event.type === "refund.updated" ||
    event.type === "refund.failed"
  ) {
    const obj = event.data.object as any;
    const normalizedType =
      event.type === "refund.failed"
        ? "refund.failed"
        : obj.status === "succeeded"
          ? "refund.succeeded"
          : "refund.updated";
    return {
      provider: "stripe",
      eventType: normalizedType,
      providerEventId: event.id,
      bookingId: obj.metadata?.booking_id || null,
      idempotencyKey: obj.metadata?.payment_id || null,
      amountPaid: (obj.amount || 0) / 100,
      transactionId: obj.payment_intent || obj.id || null,
      receiptUrl: null,
      sessionId: null,
      rawPayload: event.data.object,
    };
  }

  // Unhandled event type — log but don't process
  return {
    provider: "stripe",
    eventType: `unknown.${event.type}`,
    providerEventId: event.id,
    bookingId: null,
    idempotencyKey: null,
    amountPaid: 0,
    transactionId: null,
    receiptUrl: null,
    sessionId: null,
    rawPayload: event.data.object,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflight(req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Get secrets from integration_secrets (not policy_settings)
    const { data: secretRows } = await adminClient
      .from("integration_secrets")
      .select("secret_key, encrypted_value")
      .in("secret_key", ["stripe_webhook_secret", "stripe_secret_key"]);

    const secretMap = new Map(
      (secretRows ?? []).map((s: any) => [s.secret_key, s.encrypted_value])
    );
    const webhookSecret = secretMap.get("stripe_webhook_secret");
    const stripeSecretKey = secretMap.get("stripe_secret_key");

    if (
      !webhookSecret ||
      !stripeSecretKey ||
      webhookSecret.length < 10
    ) {
      console.error("Stripe webhook secret or secret key not configured");
      await recordWebhookEvent(adminClient, "stripe", "failure", {
        reason: "Webhook secret or Stripe secret key not configured",
      });
      return new Response(JSON.stringify({ error: "Not configured" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const body = await req.text();

    // Verify and normalize via provider adapter
    // Future: detect provider from request headers/path and route accordingly
    let normalized: NormalizedPaymentEvent;
    try {
      normalized = await verifyAndNormalizeStripe(
        req,
        body,
        stripeSecretKey,
        webhookSecret
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error("Webhook verification failed:", err);
      await recordWebhookEvent(adminClient, "stripe", "failure", {
        reason: `Signature verification failed: ${reason}`,
      });
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Log the event (idempotent via unique provider_event_id)
    const { error: eventLogError } = await adminClient
      .from("payment_events")
      .insert({
        provider: normalized.provider,
        provider_event_id: normalized.providerEventId,
        event_type: normalized.eventType,
        payload: normalized.rawPayload,
        processed: false,
      });

    if (eventLogError) {
      if (eventLogError.code === "23505") {
        console.log("Duplicate webhook event ignored:", normalized.providerEventId);
        return new Response(
          JSON.stringify({ received: true, duplicate: true }),
          {
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          }
        );
      }
      console.error("Error logging payment event:", eventLogError);
    }

    // ── Handle normalized events ──

    let handlerSuccess = false;
    let handlerError: string | null = null;
    try {
      if (normalized.eventType === "payment.success") {
        await handlePaymentSuccess(adminClient, normalized, supabaseUrl, serviceRoleKey);
      } else if (normalized.eventType === "payment.failed") {
        await handlePaymentFailed(adminClient, normalized);
      } else if (normalized.eventType === "session.expired") {
        await handleSessionExpired(adminClient, normalized);
      } else if (
        normalized.eventType === "refund.succeeded" ||
        normalized.eventType === "refund.updated" ||
        normalized.eventType === "refund.failed"
      ) {
        await handleRefundEvent(adminClient, normalized, supabaseUrl, serviceRoleKey);
      }
      handlerSuccess = true;
    } catch (handlerErr) {
      handlerError = handlerErr instanceof Error ? handlerErr.message : String(handlerErr);
      console.error(`[payment-webhook] Handler failed for ${normalized.eventType}:`, handlerErr);
    }

    if (handlerSuccess) {
      await adminClient
        .from("payment_events")
        .update({ processed: true, last_error: null })
        .eq("provider_event_id", normalized.providerEventId);
      await recordWebhookEvent(adminClient, normalized.provider, "success", {
        eventId: normalized.providerEventId,
      });
    } else {
      // Bump retry counter so the watchdog can escalate stuck events
      await adminClient.rpc("increment_payment_event_retry", {
        _provider_event_id: normalized.providerEventId,
        _error: handlerError,
      }).catch(async () => {
        // Fallback if RPC absent — direct update
        await adminClient
          .from("payment_events")
          .update({ last_error: handlerError, last_retry_at: new Date().toISOString() })
          .eq("provider_event_id", normalized.providerEventId);
      });
      await recordWebhookEvent(adminClient, normalized.provider, "failure", {
        eventId: normalized.providerEventId,
        reason: handlerError ?? "Handler failed",
      });
    }

    return new Response(
      JSON.stringify({ received: true, processed: handlerSuccess }),
      {
        // Return 200 even on handler failure to prevent Stripe from retrying endlessly
        // but the event stays unprocessed for manual review
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("payment-webhook error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});

// ── Event Handlers ──

async function handlePaymentSuccess(
  adminClient: any,
  event: NormalizedPaymentEvent,
  supabaseUrl: string,
  serviceRoleKey: string
) {
  const bookingId = event.bookingId;
  if (!bookingId) {
    console.error("No booking_id in payment event metadata");
    return;
  }

  const { data: booking, error: bookingErr } = await adminClient
    .from("bookings")
    .select("id, state, guest_id, total_price, unit_id")
    .eq("id", bookingId)
    .single();

  if (bookingErr || !booking) {
    console.error("Booking not found:", bookingId);
    return;
  }

  // Transition pending payment → recorded (if we created one in process-payment)
  if (event.sessionId) {
    const { data: pendingPayment } = await adminClient
      .from("payments")
      .select("id")
      .eq("provider_session_id", event.sessionId)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingPayment) {
      await adminClient
        .from("payments")
        .update({
          status: "recorded",
          provider_status: "completed",
          provider_transaction_id: event.transactionId,
          receipt_url: event.receiptUrl,
        })
        .eq("id", pendingPayment.id);

      // Link payment to event
      await adminClient
        .from("payment_events")
        .update({ payment_id: pendingPayment.id })
        .eq("provider_event_id", event.providerEventId);
    } else {
      // No pending payment found — insert a recorded one (backward compat / race condition)
      const { data: newPayment } = await adminClient
        .from("payments")
        .insert({
          booking_id: bookingId,
          amount: event.amountPaid,
          method: "card",
          status: "recorded",
          payment_type: "deposit",
          description: `Deposit — online payment`,
          source_channel: "online",
          provider: event.provider,
          provider_transaction_id: event.transactionId,
          provider_session_id: event.sessionId,
          provider_status: "completed",
          idempotency_key: event.idempotencyKey || `${event.provider}_${event.sessionId}`,
          receipt_url: event.receiptUrl,
          recorded_by: booking.guest_id,
        })
        .select()
        .single();

      if (newPayment) {
        await adminClient
          .from("payment_events")
          .update({ payment_id: newPayment.id })
          .eq("provider_event_id", event.providerEventId);
      }
    }
  }

  // Only transition if booking is in pending_deposit
  if (booking.state !== "pending_deposit") {
    console.log(
      "Booking not in pending_deposit state, skipping transition:",
      booking.state
    );
    return;
  }

  // Transition booking: pending_deposit → confirmed
  const { error: transitionErr } = await adminClient
    .from("bookings")
    .update({ state: "confirmed" })
    .eq("id", bookingId)
    .eq("state", "pending_deposit"); // Optimistic lock

  if (transitionErr) {
    console.error("Error transitioning booking:", transitionErr);
    return;
  }

  // Log state transition
  await adminClient.from("booking_state_log").insert({
    booking_id: bookingId,
    from_state: "pending_deposit",
    to_state: "confirmed",
    reason: `Online payment received via ${event.provider} (${event.transactionId})`,
  });

  // Notify guest
  if (booking.guest_id) {
    await adminClient.from("notifications").insert({
      user_id: booking.guest_id,
      type: "booking_confirmed",
      message:
        "Your deposit has been received and your booking is now confirmed!",
      reference_id: bookingId,
    });
  }

  // Notify admins
  const { data: admins } = await adminClient
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "manager"]);

  const adminNotifs = (admins ?? []).map((a: any) => ({
    user_id: a.user_id,
    type: "booking",
    message: `Online deposit received: ${event.amountPaid} — booking auto-confirmed`,
    reference_id: bookingId,
  }));
  if (adminNotifs.length > 0) {
    await adminClient.from("notifications").insert(adminNotifs);
  }

  // ── Outbound messaging bridge: payment_received (admin/manager) + payment_receipt (guest) ──
  await dispatchNotify(supabaseUrl, serviceRoleKey, {
    event_type: "payment_received",
    subject_id: bookingId,
    metadata: { amount: event.amountPaid, method: "card" },
  });
  if (booking.guest_id) {
    await dispatchNotify(supabaseUrl, serviceRoleKey, {
      event_type: "payment_receipt",
      subject_id: bookingId,
      guest_user_id: booking.guest_id,
      metadata: { amount: event.amountPaid },
    });
  }

  await dispatchVanta(supabaseUrl, serviceRoleKey, "payment.received", {
    booking_id: bookingId,
    session_id: event.sessionId ?? null,
    amount: event.amountPaid ?? null,
    currency: (event as any).currency ?? null,
  }, `ground_truth_hub:payment.received:${event.sessionId ?? bookingId}`);


  // Trigger confirmation email
  try {
    await fetch(
      `${supabaseUrl}/functions/v1/send-booking-confirmation`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ booking_id: bookingId }),
      }
    );
  } catch (emailErr) {
    console.error("Failed to trigger confirmation email:", emailErr);
  }
}

// ── Helper: server-to-server invocation of notify-via-messaging ──
async function dispatchNotify(
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: Record<string, unknown>
) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/notify-via-messaging`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("notify-via-messaging dispatch failed:", err);
  }
}

// ── Helper: fire-and-forget Vanta signal. Never blocks payment flow. ──
async function dispatchVanta(
  supabaseUrl: string,
  serviceRoleKey: string,
  event_type: "payment.received" | "payment.failed",
  payload: Record<string, unknown>,
  idempotency_key: string,
) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/vanta-emit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type,
        payload,
        idempotency_key,
        internal_token: serviceRoleKey,
      }),
    });
  } catch (err) {
    console.warn("vanta-emit dispatch failed:", err);
  }
}

async function handlePaymentFailed(
  adminClient: any,
  event: NormalizedPaymentEvent
) {
  // Transition any pending payment for this session to failed
  if (event.sessionId) {
    await adminClient
      .from("payments")
      .update({ status: "failed", provider_status: "failed" })
      .eq("provider_session_id", event.sessionId)
      .eq("status", "pending");
  }

  // Notify guest if we have a booking
  if (event.bookingId) {
    const { data: booking } = await adminClient
      .from("bookings")
      .select("guest_id")
      .eq("id", event.bookingId)
      .single();

    if (booking?.guest_id) {
      await adminClient.from("notifications").insert({
        user_id: booking.guest_id,
        type: "booking",
        message:
          "Your payment could not be processed. Please try again or contact the front desk.",
        reference_id: event.bookingId,
      });
    }

    // Outbound to admin/manager
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await dispatchNotify(supabaseUrl, serviceRoleKey, {
      event_type: "payment_failed",
      subject_id: event.bookingId,
      metadata: { amount: event.amountPaid, reason: "card declined" },
    });
    await dispatchVanta(supabaseUrl, serviceRoleKey, "payment.failed", {
      booking_id: event.bookingId,
      session_id: event.sessionId ?? null,
      amount: event.amountPaid ?? null,
      currency: (event as any).currency ?? null,
    }, `ground_truth_hub:payment.failed:${event.sessionId ?? event.bookingId}`);
  }
}

async function handleSessionExpired(
  adminClient: any,
  event: NormalizedPaymentEvent
) {
  // Transition pending payment to cancelled
  if (event.sessionId) {
    await adminClient
      .from("payments")
      .update({ status: "cancelled", provider_status: "expired" })
      .eq("provider_session_id", event.sessionId)
      .eq("status", "pending");
  }
}

async function handleRefundEvent(
  adminClient: any,
  event: NormalizedPaymentEvent,
  supabaseUrl: string,
  serviceRoleKey: string
) {
  // Find the matching payment by Stripe payment_intent (transactionId)
  if (!event.transactionId) {
    console.warn("[refund] No payment_intent in refund event; skipping");
    return;
  }
  const { data: payment } = await adminClient
    .from("payments")
    .select("id, amount, refund_amount, status, booking_id")
    .eq("provider_transaction_id", event.transactionId)
    .maybeSingle();
  if (!payment) {
    console.warn("[refund] No matching payment for", event.transactionId);
    return;
  }

  const refundObj = event.rawPayload as any;
  const refundedTotalCents = Number(refundObj.amount_refunded ?? refundObj.amount ?? 0);
  const refundedTotal = refundedTotalCents / 100;

  if (event.eventType === "refund.failed") {
    // Stripe failed an async refund — alert admins, do not mutate amount
    if (payment.booking_id) {
      const { data: admins } = await adminClient
        .from("user_roles").select("user_id").in("role", ["admin", "manager"]);
      const notifs = (admins ?? []).map((a: any) => ({
        user_id: a.user_id,
        type: "booking",
        message: `Refund FAILED at provider: ${refundObj.failure_reason || "unknown"}`,
        reference_id: payment.booking_id,
      }));
      if (notifs.length > 0) await adminClient.from("notifications").insert(notifs);
    }
    return;
  }

  // refund.succeeded / refund.updated — sync DB to Stripe's truth
  if (refundedTotal > 0) {
    const isFull = Math.abs(refundedTotal - Number(payment.amount)) < 0.01;
    await adminClient
      .from("payments")
      .update({
        refund_amount: refundedTotal,
        status: isFull ? "refunded" : "partially_refunded",
      })
      .eq("id", payment.id);
  }

  // Link this event to the payment
  await adminClient
    .from("payment_events")
    .update({ payment_id: payment.id })
    .eq("provider_event_id", event.providerEventId);
}
