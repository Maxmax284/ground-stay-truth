import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { booking_id, confirmed_airport } = await req.json();
    if (!booking_id) {
      return new Response(JSON.stringify({ error: "booking_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const airportCode = confirmed_airport || null;

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify guest owns this booking
    const { data: booking, error: bookingError } = await serviceClient
      .from("bookings")
      .select("id, guest_id, unit_id, units(name)")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking || booking.guest_id !== user.id) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find pickup for this booking
    const { data: pickup, error: pickupError } = await serviceClient
      .from("airport_pickups")
      .select("id, status, guest_landed_at, driver_id")
      .eq("booking_id", booking_id)
      .single();

    if (pickupError || !pickup) {
      return new Response(JSON.stringify({ error: "No pickup found for this booking" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Already landed
    if (pickup.guest_landed_at) {
      return new Response(JSON.stringify({ ok: true, already: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update guest_landed_at and confirmed_airport
    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = { guest_landed_at: now };
    if (airportCode) updatePayload.confirmed_airport = airportCode;

    const { error: updateError } = await serviceClient
      .from("airport_pickups")
      .update(updatePayload)
      .eq("id", pickup.id);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cross-check: if flight tracking exists, compare arrival_iata with confirmed airport
    let airportMismatch = false;
    if (airportCode) {
      const { data: flightTrack } = await serviceClient
        .from("flight_tracking")
        .select("arrival_iata")
        .eq("pickup_id", pickup.id)
        .maybeSingle();

      if (flightTrack?.arrival_iata) {
        const flightIata = flightTrack.arrival_iata.toUpperCase();
        const confirmedIata = airportCode.toUpperCase() === "SAMUI" ? "USM" : airportCode.toUpperCase();
        if (flightIata !== confirmedIata && flightIata !== "") {
          airportMismatch = true;
        }
      }
    }

    // Get guest name
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .single();

    const guestName = profile?.full_name || "A guest";
    const unitName = (booking as any).units?.name || "unknown unit";

    // Notify all staff (admin + manager + front_desk_supervisor + front_desk)
    const { data: staffRoles } = await serviceClient
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "manager", "front_desk_supervisor", "front_desk"]);

    const uniqueStaffIds = [...new Set((staffRoles ?? []).map((r: any) => r.user_id))];

    if (uniqueStaffIds.length > 0) {
      const notifications = uniqueStaffIds.map((staffId) => ({
        user_id: staffId,
        type: "guest_landed",
        reference_id: booking_id,
        message: `${guestName} has landed and is ready for pickup (${unitName}).`,
      }));

      await serviceClient.from("notifications").insert(notifications);
    }

    return new Response(JSON.stringify({ ok: true, landed_at: now }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
