import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

const AVIATIONSTACK_BASE = "http://api.aviationstack.com/v1";
const STALE_MINUTES = 10;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Role check — staff or admin
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roles } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "manager", "front_desk", "front_desk_supervisor"]);
    if (!roles?.length) {
      return new Response(JSON.stringify({ error: "Staff role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const AVIATIONSTACK_KEY = Deno.env.get("AVIATIONSTACK_API_KEY");
    if (!AVIATIONSTACK_KEY) {
      return new Response(JSON.stringify({ error: "AviationStack API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { pickup_id, flight_number, force_refresh } = body;

    if (!pickup_id || !flight_number) {
      return new Response(JSON.stringify({ error: "pickup_id and flight_number are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean flight number: remove spaces, uppercase
    const cleanFlight = flight_number.replace(/\s+/g, "").toUpperCase();

    // Check cache first
    const { data: cached } = await serviceClient
      .from("flight_tracking")
      .select("*")
      .eq("pickup_id", pickup_id)
      .maybeSingle();

    if (cached && !force_refresh) {
      const lastChecked = new Date(cached.last_checked_at).getTime();
      const now = Date.now();
      const minutesSinceCheck = (now - lastChecked) / 60000;

      // If landed/cancelled, no need to re-check
      if (["landed", "cancelled", "diverted"].includes(cached.flight_status)) {
        return new Response(JSON.stringify({ flight: cached, source: "cache" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If fresh enough, return cache
      if (minutesSinceCheck < STALE_MINUTES) {
        return new Response(JSON.stringify({ flight: cached, source: "cache" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Call AviationStack
    const apiUrl = `${AVIATIONSTACK_BASE}/flights?access_key=${AVIATIONSTACK_KEY}&flight_iata=${cleanFlight}&limit=1`;
    const apiResp = await fetch(apiUrl);

    if (!apiResp.ok) {
      console.error("AviationStack error:", apiResp.status, await apiResp.text());
      // Return cache if available
      if (cached) {
        return new Response(JSON.stringify({ flight: cached, source: "cache_fallback", api_error: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Flight API unavailable" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiData = await apiResp.json();

    if (apiData.error) {
      console.error("AviationStack API error:", JSON.stringify(apiData.error));
      if (cached) {
        return new Response(JSON.stringify({ flight: cached, source: "cache_fallback", api_error: apiData.error }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: apiData.error.message || "Flight lookup failed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const flightData = apiData.data?.[0];
    if (!flightData) {
      // No results — store as unknown
      const record = {
        pickup_id,
        flight_number: cleanFlight,
        flight_status: "not_found",
        last_checked_at: new Date().toISOString(),
      };

      if (cached) {
        await serviceClient.from("flight_tracking").update(record).eq("id", cached.id);
      } else {
        await serviceClient.from("flight_tracking").insert(record);
      }

      return new Response(JSON.stringify({ flight: { ...cached, ...record }, source: "api", found: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map AviationStack response
    const statusMap: Record<string, string> = {
      scheduled: "scheduled",
      active: "in_air",
      landed: "landed",
      cancelled: "cancelled",
      incident: "incident",
      diverted: "diverted",
    };

    const delayMinutes = flightData.arrival?.delay ?? flightData.departure?.delay ?? 0;

    const record = {
      pickup_id,
      flight_number: cleanFlight,
      airline_name: flightData.airline?.name ?? null,
      departure_airport: flightData.departure?.airport ?? null,
      departure_iata: flightData.departure?.iata ?? null,
      arrival_airport: flightData.arrival?.airport ?? null,
      arrival_iata: flightData.arrival?.iata ?? null,
      scheduled_departure: flightData.departure?.scheduled ?? null,
      estimated_departure: flightData.departure?.estimated ?? null,
      actual_departure: flightData.departure?.actual ?? null,
      scheduled_arrival: flightData.arrival?.scheduled ?? null,
      estimated_arrival: flightData.arrival?.estimated ?? null,
      actual_arrival: flightData.arrival?.actual ?? null,
      flight_status: statusMap[flightData.flight_status] ?? flightData.flight_status ?? "unknown",
      delay_minutes: delayMinutes,
      terminal: flightData.arrival?.terminal ?? null,
      gate: flightData.arrival?.gate ?? null,
      raw_response: flightData,
      last_checked_at: new Date().toISOString(),
    };

    let saved;
    if (cached) {
      const { data, error } = await serviceClient
        .from("flight_tracking")
        .update(record)
        .eq("id", cached.id)
        .select()
        .single();
      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await serviceClient
        .from("flight_tracking")
        .insert(record)
        .select()
        .single();
      if (error) throw error;
      saved = data;
    }

    // Phase 2: Server-side confidence evaluation
    // Queries checklist + flight signals to compute assist_mode
    try {
      const { data: pickup } = await serviceClient
        .from("airport_pickups")
        .select("assist_mode, confirmed_airport, booking_id, flight_number, guest_landed_at")
        .eq("id", pickup_id)
        .single();

      if (pickup) {
        const currentMode = pickup.assist_mode || "healthy";

        // Don't auto-change manual_assist or recovery_pending (sticky states)
        if (currentMode !== "manual_assist" && currentMode !== "recovery_pending") {
          // Query pre-arrival checklist for critical items
          const CRITICAL_KEYS = ["connectivity_readiness", "confirm_domestic_flight", "tdac_completed", "upload_id", "confirm_arrival_time"];
          const { data: checklistItems } = await serviceClient
            .from("pre_arrival_checklist")
            .select("item_key, completed")
            .eq("booking_id", pickup.booking_id)
            .in("item_key", CRITICAL_KEYS);

          const completedKeys = new Set(
            (checklistItems ?? []).filter((i: any) => i.completed).map((i: any) => i.item_key)
          );

          // Build degraded reasons
          const degradedReasons: string[] = [];

          // Location mismatch → hard trigger
          const locationMismatch = pickup.confirmed_airport &&
            record.arrival_iata &&
            pickup.confirmed_airport.toLowerCase() !== record.arrival_iata.toLowerCase();

          if (locationMismatch) {
            await serviceClient
              .from("airport_pickups")
              .update({
                assist_mode: "manual_assist",
                assist_reason: `Guest confirmed ${pickup.confirmed_airport!.toUpperCase()} but flight data shows ${record.arrival_iata!.toUpperCase()}.`,
                assist_activated_at: new Date().toISOString(),
              })
              .eq("id", pickup_id);
          } else {
            // Flight data signals
            if (record.flight_status === "not_found") {
              degradedReasons.push("Flight number not found in tracking system.");
            }

            // Checklist signals
            if (!completedKeys.has("connectivity_readiness") && !completedKeys.has("confirm_domestic_flight") && !pickup.flight_number) {
              // Only count domestic flight missing if pickup also lacks flight_number
            }
            if (!completedKeys.has("connectivity_readiness")) {
              degradedReasons.push("Guest has not confirmed internet access for arrival — communication may fail.");
            }
            if (!completedKeys.has("confirm_domestic_flight") && !pickup.flight_number) {
              degradedReasons.push("Guest has not confirmed their Samui flight — pickup timing unavailable.");
            }
            if (!completedKeys.has("tdac_completed")) {
              degradedReasons.push("Thailand arrival card not completed — may delay immigration.");
            }

            if (degradedReasons.length > 0) {
              const newMode = degradedReasons.length >= 3 ? "manual_assist" : "degraded";
              await serviceClient
                .from("airport_pickups")
                .update({
                  assist_mode: newMode,
                  assist_reason: degradedReasons.join(" "),
                  ...(newMode === "manual_assist" ? { assist_activated_at: new Date().toISOString() } : {}),
                })
                .eq("id", pickup_id);
            } else if (currentMode === "degraded") {
              // Signals cleared → restore healthy
              await serviceClient
                .from("airport_pickups")
                .update({ assist_mode: "healthy", assist_reason: null })
                .eq("id", pickup_id);
            }
          }
        }
      }
    } catch (assistErr) {
      console.error("assist_mode update error (non-critical):", assistErr);
    }

    return new Response(JSON.stringify({ flight: saved, source: "api", found: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("check-flight-status error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
