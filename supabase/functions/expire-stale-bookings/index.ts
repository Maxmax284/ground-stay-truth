import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ─── AUTH: Only allow internal/cron calls with service role key ───────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized — internal use only" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get policy settings
    const { data: policies } = await supabase
      .from("policy_settings")
      .select("key, value")
      .in("key", [
        "soft_hold_expiration_hours",
        "deposit_deadline_hours",
        "deposit_reminder_hours",
        "deposit_percentage",
        "currency_symbol",
      ]);

    const policyMap = new Map((policies ?? []).map((p: any) => [p.key, String(p.value).replace(/^"|"$/g, "")]));
    const softHoldHours = Number(policyMap.get("soft_hold_expiration_hours") ?? 12);
    const depositHours = Number(policyMap.get("deposit_deadline_hours") ?? 24);
    const reminderHours = Number(policyMap.get("deposit_reminder_hours") ?? 12);
    const depositPercentage = Number(policyMap.get("deposit_percentage") ?? 100);
    const currencySymbol = policyMap.get("currency_symbol") || "฿";

    const now = new Date();
    let expired = 0;
    let reminders = 0;
    let expiredPayments = 0;

    // 1. Expire soft holds
    const softHoldCutoff = new Date(
      now.getTime() - softHoldHours * 60 * 60 * 1000
    ).toISOString();

    const { data: staleSoftHolds } = await supabase
      .from("bookings")
      .select("id")
      .eq("state", "soft_hold")
      .lt("updated_at", softHoldCutoff);

    for (const booking of staleSoftHolds ?? []) {
      // State-gate: only cancel if still in soft_hold (prevents race with concurrent state changes)
      const { error, count } = await supabase
        .from("bookings")
        .update({ state: "cancelled" })
        .eq("id", booking.id)
        .eq("state", "soft_hold");

      if (!error) {
        await supabase.from("booking_state_log").insert({
          booking_id: booking.id,
          from_state: "soft_hold",
          to_state: "cancelled",
          changed_by: null,
          reason: `[SYSTEM] Soft hold expired after ${softHoldHours} hours`,
        });
        expired++;
      }
    }

    // 2. Send deposit reminders (before expiring)
    const reminderCutoff = new Date(
      now.getTime() - reminderHours * 60 * 60 * 1000
    ).toISOString();
    const depositCutoff = new Date(
      now.getTime() - depositHours * 60 * 60 * 1000
    ).toISOString();

    const { data: pendingDeposits } = await supabase
      .from("bookings")
      .select("id, guest_id, total_price, check_in, check_out, unit_id, units(name), profiles!bookings_guest_id_profiles_fkey(email, full_name, preferred_language)")
      .eq("state", "pending_deposit")
      .lt("updated_at", reminderCutoff)
      .gt("updated_at", depositCutoff);

    for (const booking of pendingDeposits ?? []) {
      const guestEmail = (booking as any).profiles?.email;
      const guestName = (booking as any).profiles?.full_name || "Guest";
      const guestLang = (booking as any).profiles?.preferred_language || "en";
      const unitName = (booking as any).units?.name || "Your Unit";

      if (!guestEmail) continue;

      const depositAmount = Math.round((Number(booking.total_price || 0) * depositPercentage) / 100);
      const depositFormatted = `${currencySymbol}${depositAmount.toLocaleString()}`;

      try {
        await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            template_key: "deposit_reminder",
            recipient_email: guestEmail,
            booking_id: booking.id,
            language: guestLang,
            data: {
              guest_name: guestName,
              unit_name: unitName,
              check_in: booking.check_in,
              check_out: booking.check_out,
              deposit_amount: depositFormatted,
            },
          }),
        });
        reminders++;
      } catch (e) {
        console.error("Failed to send deposit reminder:", e);
      }
    }

    // 3. Expire pending deposits past deadline
    const { data: staleDeposits } = await supabase
      .from("bookings")
      .select("id")
      .eq("state", "pending_deposit")
      .lt("updated_at", depositCutoff);

    for (const booking of staleDeposits ?? []) {
      // Check if payment exists
      const { data: payments } = await supabase
        .from("payments")
        .select("id")
        .eq("booking_id", booking.id)
        .limit(1);

      if (payments && payments.length > 0) continue;

      const { error } = await supabase
        .from("bookings")
        .update({ state: "cancelled" })
        .eq("id", booking.id);

      if (!error) {
        await supabase.from("booking_state_log").insert({
          booking_id: booking.id,
          from_state: "pending_deposit",
          to_state: "cancelled",
          changed_by: null,
          reason: `[SYSTEM] Deposit deadline expired after ${depositHours} hours`,
        });
        expired++;
      }
    }

    // 4. Expire stale pending payments past expires_at
    const { data: stalePayments } = await supabase
      .from("payments")
      .select("id, booking_id, status, payment_type")
      .eq("status", "pending")
      .not("expires_at", "is", null)
      .lt("expires_at", now.toISOString());

    for (const payment of stalePayments ?? []) {
      const { error } = await supabase
        .from("payments")
        .update({ status: "cancelled", provider_status: "expired" })
        .eq("id", payment.id);

      if (!error) {
        expiredPayments++;

        // If this was a deposit payment, check if booking should be cancelled
        if (payment.payment_type === "deposit") {
          const { data: otherPayments } = await supabase
            .from("payments")
            .select("id")
            .eq("booking_id", payment.booking_id)
            .in("status", ["recorded", "pending"])
            .neq("id", payment.id)
            .limit(1);

          if (!otherPayments || otherPayments.length === 0) {
            // No other active payments — cancel the booking if still pending_deposit
            const { data: booking } = await supabase
              .from("bookings")
              .select("state")
              .eq("id", payment.booking_id)
              .single();

            if (booking?.state === "pending_deposit") {
              await supabase
                .from("bookings")
                .update({ state: "cancelled" })
                .eq("id", payment.booking_id);

              await supabase.from("booking_state_log").insert({
                booking_id: payment.booking_id,
                from_state: "pending_deposit",
                to_state: "cancelled",
                changed_by: null,
                reason: "[SYSTEM] Payment session expired — no successful payments on file",
              });
              expired++;
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, expired, reminders, expiredPayments, timestamp: now.toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
