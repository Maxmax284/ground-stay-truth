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
    const today = now.toISOString().split("T")[0];
    let preArrivalSent = 0;
    let reviewRequestsSent = 0;

    // Fetch policy settings
    const { data: policies } = await supabase
      .from("policy_settings")
      .select("key, value")
      .in("key", ["earliest_checkin_time", "checkout_time"]);

    const policyMap = new Map((policies ?? []).map((p: any) => [p.key, String(p.value).replace(/^"|"$/g, "")]));
    const checkinTime = policyMap.get("earliest_checkin_time") || "16:00";

    // 1. Pre-arrival reminders: 3 days before check_in for confirmed bookings
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const { data: preArrivalBookings } = await supabase
      .from("bookings")
      .select("id, guest_id, check_in, check_out, unit_id, units(name), profiles!bookings_guest_id_profiles_fkey(email, full_name, preferred_language)")
      .eq("state", "confirmed")
      .eq("check_in", threeDaysFromNow);

    for (const booking of preArrivalBookings ?? []) {
      const guestEmail = (booking as any).profiles?.email;
      const guestName = (booking as any).profiles?.full_name || "Guest";
      const guestLang = (booking as any).profiles?.preferred_language || "en";
      const unitName = (booking as any).units?.name || "Your Unit";

      if (!guestEmail) continue;

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            template_key: "pre_arrival_reminder",
            recipient_email: guestEmail,
            booking_id: booking.id,
            language: guestLang,
            data: {
              guest_name: guestName,
              unit_name: unitName,
              check_in: booking.check_in,
              check_out: booking.check_out,
              checkin_time: checkinTime,
            },
          }),
        });
        const result = await resp.json();
        if (result.sent || result.skipped) preArrivalSent++;
      } catch (e) {
        console.error("Pre-arrival email failed:", e);
      }
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
      const guestName = (booking as any).profiles?.full_name || "Guest";
      const guestLang = (booking as any).profiles?.preferred_language || "en";
      const unitName = (booking as any).units?.name || "Your Unit";

      if (!guestEmail) continue;

      // Check if review already exists
      const { data: existingReview } = await supabase
        .from("reviews")
        .select("id")
        .eq("booking_id", booking.id)
        .maybeSingle();

      if (existingReview) continue;

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            template_key: "review_request",
            recipient_email: guestEmail,
            booking_id: booking.id,
            language: guestLang,
            data: {
              guest_name: guestName,
              unit_name: unitName,
              check_in: booking.check_in,
              check_out: booking.check_out,
            },
          }),
        });
        const result = await resp.json();
        if (result.sent || result.skipped) reviewRequestsSent++;
      } catch (e) {
        console.error("Review request email failed:", e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        pre_arrival_sent: preArrivalSent,
        review_requests_sent: reviewRequestsSent,
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
