import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Simple in-memory rate limiter ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // max calls per window
const RATE_WINDOW_MS = 60 * 1000; // 1 minute

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

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

    // Rate limit per user
    if (!checkRateLimit(user.id)) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
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
      .select("id, status, guest_landed_at, driver_id, flight_number, international_flight_number, final_flight_confirmed")
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

    // Determine travel state for notifications
    const hasConnectingFlight = !!pickup.international_flight_number;
    const isInTransit = hasConnectingFlight && airportCode && airportCode.toLowerCase() === "bkk";
    const isAtFinalDestination = !isInTransit;

    // Cross-check: if flight tracking exists, compare arrival_iata with confirmed airport
    let airportMismatch = false;
    if (airportCode && !isInTransit) {
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

    const airportDisplayMap: Record<string, string> = {
      bkk: "BKK (Suvarnabhumi)",
      usm: "USM (Koh Samui)",
      samui: "USM (Koh Samui)",
    };
    const airportDisplay = airportCode ? (airportDisplayMap[airportCode.toLowerCase()] ?? airportCode) : "unknown airport";

    // Notify all staff
    const { data: staffRoles } = await serviceClient
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "manager", "front_desk_supervisor", "front_desk"]);

    const uniqueStaffIds = [...new Set((staffRoles ?? []).map((r: any) => r.user_id))];

    if (uniqueStaffIds.length > 0) {
      let message: string;

      if (isInTransit) {
        // Guest landed at BKK, still needs connecting flight to Samui
        message = `🔄 ${guestName} has landed at BKK (Suvarnabhumi) on ${pickup.international_flight_number}. They are IN TRANSIT — awaiting connection to Koh Samui`;
        if (pickup.flight_number) {
          message += ` on ${pickup.flight_number}`;
        } else {
          message += ` (domestic flight not yet confirmed)`;
        }
        message += ` (${unitName}).`;
      } else if (hasConnectingFlight && isAtFinalDestination) {
        // Guest arrived at final destination after connecting
        message = `✅ ${guestName} has arrived at ${airportDisplay} — final destination reached (${unitName}). Ready for pickup.`;
      } else {
        // Direct flight — standard message
        message = `${guestName} has landed at ${airportDisplay} and is ready for pickup (${unitName}).`;
      }

      if (airportMismatch) {
        message += ` ⚠️ MISMATCH: Guest selected ${airportDisplay} but flight data shows a different airport. Please verify.`;
      }

      const notifications = uniqueStaffIds.map((staffId) => ({
        user_id: staffId,
        type: "guest_landed",
        reference_id: booking_id,
        message,
      }));

      await serviceClient.from("notifications").insert(notifications);
    }

    return new Response(JSON.stringify({
      ok: true,
      landed_at: now,
      airport_mismatch: airportMismatch,
      in_transit: isInTransit,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
