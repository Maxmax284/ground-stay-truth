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
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    let preArrivalSent = 0;
    let reviewRequestsSent = 0;
    let depositRemindersSent = 0;
    let welcomeMessagesSent = 0;

    // Fetch policy settings
    const { data: policies } = await supabase
      .from("policy_settings")
      .select("key, value")
      .in("key", [
        "earliest_checkin_time", "checkout_time",
        "email_deposit_reminder_enabled", "email_welcome_enabled",
      ]);

    const policyMap = new Map((policies ?? []).map((p: any) => [p.key, String(p.value).replace(/^"|"$/g, "")]));
    const checkinTime = policyMap.get("earliest_checkin_time") || "16:00";
    const depositRemindersEnabled = policyMap.get("email_deposit_reminder_enabled") !== "false";
    const welcomeEnabled = policyMap.get("email_welcome_enabled") !== "false";

    // Helper to send email
    async function sendEmail(templateKey: string, recipientEmail: string, bookingId: string, language: string, data: Record<string, any>) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ template_key: templateKey, recipient_email: recipientEmail, booking_id: bookingId, language, data }),
        });
        const result = await resp.json();
        return result.sent || result.skipped;
      } catch (e) {
        console.error(`Email ${templateKey} failed:`, e);
        return false;
      }
    }

    // 1. Pre-arrival reminders: 3 days before check_in for confirmed bookings
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const { data: preArrivalBookings } = await supabase
      .from("bookings")
      .select("id, guest_id, check_in, check_out, unit_id, units(name), profiles!bookings_guest_id_profiles_fkey(email, full_name, preferred_language)")
      .eq("state", "confirmed")
      .eq("check_in", threeDaysFromNow);

    for (const booking of preArrivalBookings ?? []) {
      const guestEmail = (booking as any).profiles?.email;
      if (!guestEmail) continue;
      const sent = await sendEmail("pre_arrival_reminder", guestEmail, booking.id,
        (booking as any).profiles?.preferred_language || "en", {
          guest_name: (booking as any).profiles?.full_name || "Guest",
          unit_name: (booking as any).units?.name || "Your Unit",
          check_in: booking.check_in, check_out: booking.check_out, checkin_time: checkinTime,
        });
      if (sent) preArrivalSent++;
    }

    // 2. Review requests: bookings completed 24h ago
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const { data: completedBookings } = await supabase
      .from("bookings")
      .select("id, guest_id, check_in, check_out, unit_id, units(name), profiles!bookings_guest_id_profiles_fkey(email, full_name, preferred_language)")
      .eq("state", "completed")
      .lt("updated_at", oneDayAgo)
      .gt("updated_at", twoDaysAgo);

    for (const booking of completedBookings ?? []) {
      const guestEmail = (booking as any).profiles?.email;
      if (!guestEmail) continue;
      const { data: existingReview } = await supabase.from("reviews").select("id").eq("booking_id", booking.id).maybeSingle();
      if (existingReview) continue;
      const sent = await sendEmail("review_request", guestEmail, booking.id,
        (booking as any).profiles?.preferred_language || "en", {
          guest_name: (booking as any).profiles?.full_name || "Guest",
          unit_name: (booking as any).units?.name || "Your Unit",
          check_in: booking.check_in, check_out: booking.check_out,
        });
      if (sent) reviewRequestsSent++;
    }

    // 3. Deposit reminders (12h and 24h after entering pending_deposit)
    if (depositRemindersEnabled) {
      const { data: pendingDepositBookings } = await supabase
        .from("bookings")
        .select("id, guest_id, check_in, check_out, total_price, unit_id, units(name), profiles!bookings_guest_id_profiles_fkey(email, full_name, preferred_language)")
        .eq("state", "pending_deposit");

      for (const booking of pendingDepositBookings ?? []) {
        const guestEmail = (booking as any).profiles?.email;
        if (!guestEmail) continue;

        // Check when it entered pending_deposit
        const { data: stateLog } = await supabase
          .from("booking_state_log")
          .select("created_at")
          .eq("booking_id", booking.id)
          .eq("to_state", "pending_deposit")
          .order("created_at", { ascending: false })
          .limit(1);

        if (!stateLog?.length) continue;
        const enteredAt = new Date(stateLog[0].created_at);
        const hoursSince = (now.getTime() - enteredAt.getTime()) / (1000 * 60 * 60);

        // Send at ~12h and ~24h marks (with 1h tolerance window)
        const shouldSend12 = hoursSince >= 11 && hoursSince < 13;
        const shouldSend24 = hoursSince >= 23 && hoursSince < 25;
        const templateKey = shouldSend12 ? "deposit_reminder_12h" : shouldSend24 ? "deposit_reminder_24h" : null;

        if (templateKey) {
          const sent = await sendEmail(templateKey, guestEmail, booking.id,
            (booking as any).profiles?.preferred_language || "en", {
              guest_name: (booking as any).profiles?.full_name || "Guest",
              unit_name: (booking as any).units?.name || "Your Unit",
              total_price: booking.total_price,
              check_in: booking.check_in,
            });
          if (sent) depositRemindersSent++;
        }
      }
    }

    // 4. Welcome message on check-in day
    if (welcomeEnabled) {
      const today = now.toISOString().split("T")[0];
      const { data: checkinBookings } = await supabase
        .from("bookings")
        .select("id, guest_id, check_in, check_out, unit_id, units(name), profiles!bookings_guest_id_profiles_fkey(email, full_name, preferred_language)")
        .eq("state", "confirmed")
        .eq("check_in", today);

      for (const booking of checkinBookings ?? []) {
        const guestEmail = (booking as any).profiles?.email;
        if (!guestEmail) continue;
        const sent = await sendEmail("welcome_checkin", guestEmail, booking.id,
          (booking as any).profiles?.preferred_language || "en", {
            guest_name: (booking as any).profiles?.full_name || "Guest",
            unit_name: (booking as any).units?.name || "Your Unit",
            checkin_time: checkinTime,
            check_in: booking.check_in,
            check_out: booking.check_out,
          });
        if (sent) welcomeMessagesSent++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        pre_arrival_sent: preArrivalSent,
        review_requests_sent: reviewRequestsSent,
        deposit_reminders_sent: depositRemindersSent,
        welcome_messages_sent: welcomeMessagesSent,
        timestamp: now.toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
