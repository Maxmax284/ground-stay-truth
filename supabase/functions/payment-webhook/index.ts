import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Get webhook secret from policy_settings
    const { data: policies } = await adminClient
      .from("policy_settings")
      .select("key, value")
      .in("key", ["stripe_webhook_secret", "stripe_secret_key", "deposit_percentage", "currency_symbol"]);

    const policyMap = new Map((policies ?? []).map((p: any) => [p.key, String(p.value).replace(/^"|"$/g, "")]));
    const webhookSecret = policyMap.get("stripe_webhook_secret");
    const stripeSecretKey = policyMap.get("stripe_secret_key");

    if (!webhookSecret || !stripeSecretKey || webhookSecret.length < 10) {
      console.error("Stripe webhook secret or secret key not configured");
      return new Response(JSON.stringify({ error: "Not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.text();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log the event (idempotent via unique provider_event_id)
    const { error: eventLogError } = await adminClient
      .from("payment_events")
      .insert({
        provider: "stripe",
        provider_event_id: event.id,
        event_type: event.type,
        payload: event.data.object as any,
        processed: false,
      });

    if (eventLogError) {
      // Unique constraint violation = duplicate event, safe to ignore
      if (eventLogError.code === "23505") {
        console.log("Duplicate webhook event ignored:", event.id);
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("Error logging payment event:", eventLogError);
    }

    // Process the event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.booking_id;
      const idempotencyKey = session.metadata?.idempotency_key;

      if (!bookingId) {
        console.error("No booking_id in session metadata");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch booking with FOR UPDATE semantics via service role
      const { data: booking, error: bookingErr } = await adminClient
        .from("bookings")
        .select("id, state, guest_id, total_price, unit_id")
        .eq("id", bookingId)
        .single();

      if (bookingErr || !booking) {
        console.error("Booking not found:", bookingId);
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Only process if booking is still in pending_deposit
      if (booking.state !== "pending_deposit") {
        console.log("Booking not in pending_deposit state, skipping:", booking.state);
        // Mark event as processed
        await adminClient
          .from("payment_events")
          .update({ processed: true })
          .eq("provider_event_id", event.id);
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const amountPaid = (session.amount_total || 0) / 100;

      // Record payment
      const { data: payment, error: paymentErr } = await adminClient
        .from("payments")
        .insert({
          booking_id: bookingId,
          amount: amountPaid,
          method: "card",
          status: "recorded",
          source_channel: "online",
          provider: "stripe",
          provider_transaction_id: session.payment_intent as string,
          provider_status: "completed",
          idempotency_key: idempotencyKey || `stripe_${session.id}`,
          receipt_url: session.receipt_url || null,
          recorded_by: booking.guest_id,
        })
        .select()
        .single();

      if (paymentErr) {
        // Idempotency key conflict = payment already recorded
        if (paymentErr.code === "23505") {
          console.log("Payment already recorded for this session");
        } else {
          console.error("Error recording payment:", paymentErr);
        }
      } else {
        // Link payment to event
        await adminClient
          .from("payment_events")
          .update({ payment_id: payment.id, processed: true })
          .eq("provider_event_id", event.id);
      }

      // Transition booking: pending_deposit → confirmed
      const { error: transitionErr } = await adminClient
        .from("bookings")
        .update({ state: "confirmed" })
        .eq("id", bookingId)
        .eq("state", "pending_deposit"); // Optimistic lock on state

      if (transitionErr) {
        console.error("Error transitioning booking:", transitionErr);
      } else {
        // Log state transition
        await adminClient.from("booking_state_log").insert({
          booking_id: bookingId,
          from_state: "pending_deposit",
          to_state: "confirmed",
          reason: `Online payment received via Stripe (${session.payment_intent})`,
        });

        // Notify guest
        if (booking.guest_id) {
          await adminClient.from("notifications").insert({
            user_id: booking.guest_id,
            type: "booking_confirmed",
            message: `Your deposit has been received and your booking is now confirmed!`,
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
          message: `Online deposit received: ${amountPaid} — booking auto-confirmed`,
          reference_id: bookingId,
        }));
        if (adminNotifs.length > 0) {
          await adminClient.from("notifications").insert(adminNotifs);
        }

        // Trigger confirmation email
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-booking-confirmation`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ booking_id: bookingId }),
          });
        } catch (emailErr) {
          console.error("Failed to trigger confirmation email:", emailErr);
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("payment-webhook error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
