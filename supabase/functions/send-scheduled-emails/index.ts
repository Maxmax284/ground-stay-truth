import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Lovable preview/dev origins
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
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
        "wifi_network_name", "wifi_password",
        "house_rules_summary", "emergency_contact_name", "emergency_contact_phone",
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
        .select("id, guest_id, check_in, check_out, unit_id, units(name, wifi_network, wifi_password, house_rules_detail, emergency_contact_name, emergency_contact_phone), profiles!bookings_guest_id_profiles_fkey(email, full_name, preferred_language)")
        .eq("state", "confirmed")
        .eq("check_in", today);

      for (const booking of checkinBookings ?? []) {
        const guestEmail = (booking as any).profiles?.email;
        if (!guestEmail) continue;

        // Per-unit overrides with global fallback
        const unit = (booking as any).units;
        const wifiNetwork = unit?.wifi_network || policyMap.get("wifi_network_name") || "";
        const wifiPassword = unit?.wifi_password || policyMap.get("wifi_password") || "";
        const houseRules = unit?.house_rules_detail || policyMap.get("house_rules_summary") || "";
        const emergencyName = unit?.emergency_contact_name || policyMap.get("emergency_contact_name") || "Front Desk";
        const emergencyPhone = unit?.emergency_contact_phone || policyMap.get("emergency_contact_phone") || "";

        const sent = await sendEmail("welcome_checkin", guestEmail, booking.id,
          (booking as any).profiles?.preferred_language || "en", {
            guest_name: (booking as any).profiles?.full_name || "Guest",
            unit_name: unit?.name || "Your Unit",
            checkin_time: checkinTime,
            checkout_time: policyMap.get("checkout_time") || "11:00",
            check_in: booking.check_in,
            check_out: booking.check_out,
            wifi_network: wifiNetwork,
            wifi_password: wifiPassword,
            house_rules: houseRules,
            emergency_name: emergencyName,
            emergency_phone: emergencyPhone,
          });
        if (sent) welcomeMessagesSent++;

        // Create in-app notification with essentials for the guest
        if (booking.guest_id) {
          const essentialsParts: string[] = [];
          if (wifiNetwork) essentialsParts.push(`WiFi: ${wifiNetwork}${wifiPassword ? ` / ${wifiPassword}` : ""}`);
          if (emergencyPhone) essentialsParts.push(`Emergency: ${emergencyName} ${emergencyPhone}`);
          const notifMessage = essentialsParts.length > 0
            ? `Welcome! Your stay essentials are ready. ${essentialsParts.join(" • ")}. View full details in Stay Essentials.`
            : `Welcome to ${unit?.name || "your unit"}! Check Stay Essentials for WiFi, house rules & emergency contacts.`;

          // Idempotency: check if we already sent this notification today
          const { data: existingNotif } = await supabase
            .from("notifications")
            .select("id")
            .eq("user_id", booking.guest_id)
            .eq("type", "stay_essentials")
            .eq("reference_id", booking.id)
            .maybeSingle();

          if (!existingNotif) {
            await supabase.from("notifications").insert({
              user_id: booking.guest_id,
              type: "stay_essentials",
              message: notifMessage,
              reference_id: booking.id,
            });
          }
        }
      }
    }

    // 5. Daily staff digest notifications
    let staffDigestsSent = 0;
    const today = now.toISOString().split("T")[0];

    // Check if digest was already sent today (idempotency)
    const { data: existingDigest } = await supabase
      .from("notifications")
      .select("id")
      .eq("type", "daily_digest")
      .gte("created_at", `${today}T00:00:00Z`)
      .limit(1);

    if (!existingDigest?.length) {
      // Gather today's operational counts
      const { count: checkInsCount } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("check_in", today)
        .in("state", ["confirmed", "pending_deposit"]);

      const { count: checkOutsCount } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("check_out", today)
        .in("state", ["checked_in", "confirmed"]);

      const { count: housekeepingCount } = await supabase
        .from("housekeeping_tasks")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "in_progress"]);

      const { count: maintenanceCount } = await supabase
        .from("maintenance_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]);

      const { count: laundryCount } = await supabase
        .from("laundry_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "picked_up"]);

      const ci = checkInsCount ?? 0;
      const co = checkOutsCount ?? 0;
      const hk = housekeepingCount ?? 0;
      const mx = maintenanceCount ?? 0;
      const lr = laundryCount ?? 0;

      const parts: string[] = [];
      if (ci > 0) parts.push(`${ci} check-in${ci > 1 ? "s" : ""}`);
      if (co > 0) parts.push(`${co} check-out${co > 1 ? "s" : ""}`);
      if (hk > 0) parts.push(`${hk} housekeeping`);
      if (mx > 0) parts.push(`${mx} maintenance`);
      if (lr > 0) parts.push(`${lr} laundry`);

      const digestMessage = parts.length > 0
        ? `📋 Daily briefing: ${parts.join(" • ")}`
        : "📋 Daily briefing: No pending tasks today — all clear!";

      // Get all staff users (non-guest roles)
      const { data: staffRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .neq("role", "guest");

      const staffIds = [...new Set((staffRoles ?? []).map((r: any) => r.user_id))];

      if (staffIds.length > 0) {
        const notifications = staffIds.map((uid: string) => ({
          user_id: uid,
          type: "daily_digest",
          message: digestMessage,
          reference_id: today,
        }));

        const { error: insertErr } = await supabase
          .from("notifications")
          .insert(notifications);

        if (!insertErr) staffDigestsSent = staffIds.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        pre_arrival_sent: preArrivalSent,
        review_requests_sent: reviewRequestsSent,
        deposit_reminders_sent: depositRemindersSent,
        welcome_messages_sent: welcomeMessagesSent,
        staff_digests_sent: staffDigestsSent,
        timestamp: now.toISOString(),
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
