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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get policy settings
    const { data: policies } = await supabase
      .from("policy_settings")
      .select("key, value")
      .in("key", ["soft_hold_expiration_hours", "deposit_deadline_hours"]);

    const softHoldHours = Number(
      policies?.find((p) => p.key === "soft_hold_expiration_hours")?.value ?? 12
    );
    const depositHours = Number(
      policies?.find((p) => p.key === "deposit_deadline_hours")?.value ?? 24
    );

    const now = new Date();
    let expired = 0;

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
      const { error } = await supabase
        .from("bookings")
        .update({ state: "cancelled" })
        .eq("id", booking.id);

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

    // 2. Expire pending deposits
    const depositCutoff = new Date(
      now.getTime() - depositHours * 60 * 60 * 1000
    ).toISOString();

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

      if (payments && payments.length > 0) continue; // Has payment, skip

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

    return new Response(
      JSON.stringify({ success: true, expired, timestamp: now.toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
