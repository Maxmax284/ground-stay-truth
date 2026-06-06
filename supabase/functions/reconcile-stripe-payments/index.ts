// Admin-triggered sweep that fixes pending Stripe payments whose webhook
// never fired. Looks at all `payments` rows in status='pending' with a
// provider_session_id, retrieves each Stripe Checkout Session, and if it's
// actually paid, marks the payment as recorded and advances the booking
// from pending_deposit → confirmed (same logic as payment-webhook).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // ── Auth: caller must be an admin ──
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return jsonResponse(req, { error: "unauthorized" }, 401);

  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse(req, { error: "unauthorized" }, 401);

  const { data: roleRow } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .in("role", ["admin"])
    .maybeSingle();
  if (!roleRow) return jsonResponse(req, { error: "forbidden" }, 403);

  // ── Load Stripe secret ──
  const { data: secretRow } = await adminClient
    .from("integration_secrets")
    .select("encrypted_value")
    .eq("secret_key", "stripe_secret_key")
    .maybeSingle();
  const stripeSecret = secretRow?.encrypted_value;
  if (!stripeSecret || stripeSecret.length < 10) {
    return jsonResponse(req, { error: "stripe_not_configured" }, 400);
  }
  const stripe = new Stripe(stripeSecret, { apiVersion: "2023-10-16" });

  // ── Find pending stripe payments with a session id (last 30 days) ──
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: pendings, error: pendErr } = await adminClient
    .from("payments")
    .select("id, booking_id, amount, provider_session_id, payment_type, created_at")
    .eq("status", "pending")
    .eq("provider", "stripe")
    .not("provider_session_id", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);

  if (pendErr) return jsonResponse(req, { error: pendErr.message }, 500);

  const results: any[] = [];
  let reconciled = 0;
  let stillPending = 0;
  let failed = 0;

  for (const p of pendings ?? []) {
    try {
      const session = await stripe.checkout.sessions.retrieve(p.provider_session_id!);
      if (session.payment_status !== "paid") {
        stillPending++;
        results.push({ payment_id: p.id, status: session.payment_status, action: "skipped" });
        continue;
      }

      const transactionId = (session.payment_intent as string) || null;
      await adminClient.from("payments").update({
        status: "recorded",
        provider_status: "completed",
        provider_transaction_id: transactionId,
        description: "Reconciled via admin sweep (webhook missed)",
      }).eq("id", p.id).eq("status", "pending");

      // Booking state advance
      const { data: booking } = await adminClient
        .from("bookings")
        .select("state, guest_id")
        .eq("id", p.booking_id)
        .maybeSingle();
      if (booking?.state === "pending_deposit") {
        await adminClient.from("bookings")
          .update({ state: "confirmed" })
          .eq("id", p.booking_id)
          .eq("state", "pending_deposit");
        await adminClient.from("booking_state_log").insert({
          booking_id: p.booking_id,
          from_state: "pending_deposit",
          to_state: "confirmed",
          reason: `Stripe payment reconciled via admin sweep (${transactionId ?? p.provider_session_id})`,
        });
        if (booking.guest_id) {
          await adminClient.from("notifications").insert({
            user_id: booking.guest_id,
            type: "booking_confirmed",
            message: "Your deposit has been received and your booking is now confirmed!",
            reference_id: p.booking_id,
          });
        }
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-booking-confirmation`, {
            method: "POST",
            headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ booking_id: p.booking_id }),
          });
        } catch { /* ignore */ }
      }

      reconciled++;
      results.push({ payment_id: p.id, booking_id: p.booking_id, amount: p.amount, action: "reconciled" });
    } catch (e) {
      failed++;
      results.push({ payment_id: p.id, action: "error", error: String(e) });
    }
  }

  return jsonResponse(req, {
    scanned: (pendings ?? []).length,
    reconciled,
    still_pending: stillPending,
    failed,
    results,
  });
});
