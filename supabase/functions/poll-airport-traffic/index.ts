import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AVIATIONSTACK_BASE = "https://api.aviationstack.com/v1";
const MONITORED_AIRPORTS = ["BKK", "USM"]; // Suvarnabhumi & Samui
const MAX_API_CALLS_PER_RUN = 4; // Rate limit: 4 calls per 30-min run

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const AVIATIONSTACK_KEY = Deno.env.get("AVIATIONSTACK_API_KEY");
    if (!AVIATIONSTACK_KEY) {
      return new Response(JSON.stringify({ error: "AviationStack API key not configured" }), {
        status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const today = new Date().toISOString().split("T")[0];
    const results: Array<{ airport: string; direction: string; count: number; success: boolean }> = [];
    let apiCallsMade = 0;

    // Check rate limit: count how many calls we've made today
    const { data: todayRecords } = await serviceClient
      .from("airport_traffic")
      .select("id", { count: "exact", head: true })
      .eq("flight_date", today);

    // Fetch arrivals and departures for each airport
    for (const airport of MONITORED_AIRPORTS) {
      for (const direction of ["arrival", "departure"] as const) {
        if (apiCallsMade >= MAX_API_CALLS_PER_RUN) {
          console.log("Rate limit reached, stopping API calls");
          break;
        }

        try {
          const param = direction === "arrival" ? "arr_iata" : "dep_iata";
          const apiUrl = `${AVIATIONSTACK_BASE}/flights?access_key=${AVIATIONSTACK_KEY}&${param}=${airport}&flight_date=${today}&limit=100`;
          
          const apiResp = await fetch(apiUrl);
          apiCallsMade++;

          if (!apiResp.ok) {
            console.error(`API error for ${airport} ${direction}:`, apiResp.status);
            results.push({ airport, direction, count: 0, success: false });
            continue;
          }

          const apiData = await apiResp.json();
          if (apiData.error) {
            console.error(`AviationStack error:`, JSON.stringify(apiData.error));
            results.push({ airport, direction, count: 0, success: false });
            continue;
          }

          const flights = apiData.data ?? [];
          let upsertCount = 0;

          // Get today's pickups with flight numbers to cross-reference
          const { data: todayPickups } = await serviceClient
            .from("airport_pickups")
            .select("id, flight_number")
            .not("flight_number", "is", null);

          const pickupByFlight: Record<string, string> = {};
          (todayPickups ?? []).forEach((p: any) => {
            const clean = p.flight_number.replace(/\s+/g, "").toUpperCase();
            pickupByFlight[clean] = p.id;
          });

          for (const fd of flights) {
            const flightIata = fd.flight?.iata;
            if (!flightIata) continue;

            const cleanFlight = flightIata.replace(/\s+/g, "").toUpperCase();
            const linkedPickupId = pickupByFlight[cleanFlight] ?? null;

            const record = {
              flight_iata: cleanFlight,
              airline_name: fd.airline?.name ?? null,
              departure_iata: fd.departure?.iata ?? null,
              arrival_iata: fd.arrival?.iata ?? null,
              departure_airport: fd.departure?.airport ?? null,
              arrival_airport: fd.arrival?.airport ?? null,
              scheduled_departure: fd.departure?.scheduled ?? null,
              scheduled_arrival: fd.arrival?.scheduled ?? null,
              estimated_arrival: fd.arrival?.estimated ?? null,
              actual_arrival: fd.arrival?.actual ?? null,
              flight_status: fd.flight_status ?? "unknown",
              delay_minutes: fd.arrival?.delay ?? fd.departure?.delay ?? 0,
              terminal: direction === "arrival" ? (fd.arrival?.terminal ?? null) : (fd.departure?.terminal ?? null),
              gate: direction === "arrival" ? (fd.arrival?.gate ?? null) : (fd.departure?.gate ?? null),
              flight_date: today,
              direction,
              airport_iata: airport,
              linked_pickup_id: linkedPickupId,
              raw_response: fd,
              last_checked_at: new Date().toISOString(),
            };

            // Upsert by unique constraint
            const { error: upsertError } = await serviceClient
              .from("airport_traffic")
              .upsert(record, { onConflict: "flight_iata,flight_date,airport_iata,direction" });

            if (upsertError) {
              console.error(`Upsert error for ${cleanFlight}:`, upsertError.message);
            } else {
              upsertCount++;
            }
          }

          results.push({ airport, direction, count: upsertCount, success: true });
          console.log(`${airport} ${direction}: ${upsertCount} flights cached`);
        } catch (err) {
          console.error(`Error fetching ${airport} ${direction}:`, err);
          results.push({ airport, direction, count: 0, success: false });
        }
      }
      if (apiCallsMade >= MAX_API_CALLS_PER_RUN) break;
    }

    const totalFlights = results.reduce((sum, r) => sum + r.count, 0);

    return new Response(JSON.stringify({
      message: `Airport traffic scan complete: ${totalFlights} flights cached across ${MONITORED_AIRPORTS.join(", ")}`,
      api_calls_made: apiCallsMade,
      rate_limit: MAX_API_CALLS_PER_RUN,
      results,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("poll-airport-traffic error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
