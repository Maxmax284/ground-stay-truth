import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// AviationStack free plan does not allow HTTPS — must use plain HTTP.
const AVIATIONSTACK_BASE = "http://api.aviationstack.com/v1";
// Gateways we receive guests from. Samui + Bangkok are always watched; the rest
// are only scanned when a guest actually flies into them today (quota-safe).
const ALWAYS_MONITORED = ["USM", "BKK"];
const SUPPORTED_AIRPORTS = ["USM", "BKK", "DMK", "URT", "HKT", "CNX", "KBV", "SIN", "KUL"];
const MAX_API_CALLS_PER_RUN = 8; // Rate limit: up to 4 airports (arr+dep) per 30-min run


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
    const results: Array<{ airport: string; direction: string; count: number; success: boolean; error?: string }> = [];
    let apiCallsMade = 0;
    let rateLimited = false;
    // Set when the provider refuses the endpoint outright (plan/key problem, not a blip).
    let planBlocked = false;
    let lastProviderError: string | null = null;

    // Check rate limit: count how many calls we've made today
    const { data: todayRecords } = await serviceClient
      .from("airport_traffic")
      .select("id", { count: "exact", head: true })
      .eq("flight_date", today);

    // Short-circuit: if nobody's actually flying in today with a known flight number,
    // don't burn AviationStack quota scanning the whole airport. Guests self-update
    // their travel status in the platform anyway.
    const startOfDay = `${today}T00:00:00`;
    const endOfDay = `${today}T23:59:59`;
    const { data: relevantPickups } = await serviceClient
      .from("airport_pickups")
      .select("id, flight_number, arrival_datetime, status")
      .not("flight_number", "is", null)
      .neq("status", "cancelled")
      .gte("arrival_datetime", startOfDay)
      .lte("arrival_datetime", endOfDay);

    // ?force=1 bypasses the quota-saving short-circuit for manual verification runs.
    const force = new URL(req.url).searchParams.get("force") === "1";
    if (!force && (!relevantPickups || relevantPickups.length === 0)) {
      console.log("No pickups today with flight numbers — skipping AviationStack scan to preserve quota.");
      return new Response(JSON.stringify({
        message: "No flights to track today. Skipped provider scan.",
        api_calls_made: 0,
        results: [],
      }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }


    // Fetch arrivals and departures for each airport
    for (const airport of MONITORED_AIRPORTS) {
      if (rateLimited || planBlocked) break;
      for (const direction of ["arrival", "departure"] as const) {
        if (rateLimited || planBlocked) break;
        if (apiCallsMade >= MAX_API_CALLS_PER_RUN) {
          console.log("Rate limit reached, stopping API calls");
          break;
        }

        try {
          // Free plan only supports real-time lookups; flight_date filtering is
          // paid-only, so we fetch live flights and filter to today ourselves.
          const param = direction === "arrival" ? "arr_iata" : "dep_iata";
          const apiUrl = `${AVIATIONSTACK_BASE}/flights?access_key=${AVIATIONSTACK_KEY}&${param}=${airport}&limit=100`;
          
          const apiResp = await fetch(apiUrl);
          apiCallsMade++;

          if (!apiResp.ok) {
            // 429 = provider quota exhausted or per-minute cap hit.
            // No point burning the rest of this run's budget — bail out and let the next scheduled run try again.
            if (apiResp.status === 429) {
              console.warn(`AviationStack rate limit hit (429) on ${airport} ${direction}. Aborting remaining calls this run. Check monthly quota / plan tier.`);
              rateLimited = true;
              results.push({ airport, direction, count: 0, success: false });
              break;
            }
            const body = (await apiResp.text().catch(() => "")).slice(0, 500);
            console.error(`API error for ${airport} ${direction}:`, apiResp.status, body);
            lastProviderError = `${apiResp.status} ${body}`;
            // 403 function_access_restricted / usage_limit_reached = the key's plan
            // cannot serve this endpoint at all. Retrying the other airports just
            // burns the run, so stop and report the failure loudly.
            if (apiResp.status === 403 || /function_access_restricted|usage_limit_reached|invalid_access_key/.test(body)) {
              planBlocked = true;
              results.push({ airport, direction, count: 0, success: false, error: "provider_rejected" });
              break;
            }
            results.push({ airport, direction, count: 0, success: false, error: `http_${apiResp.status}` });
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

            // Only cache flights actually scheduled today (Bangkok-local date via UTC+7).
            const schedRaw = direction === "arrival" ? fd.arrival?.scheduled : fd.departure?.scheduled;
            if (schedRaw) {
              const bkkDate = new Date(new Date(schedRaw).getTime() + 7 * 3600 * 1000).toISOString().split("T")[0];
              if (bkkDate !== today) continue;
            }

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
    const allFailed = results.length > 0 && results.every((r) => !r.success);

    // A run where the provider refused everything is a failure, not a quiet success.
    if (planBlocked || (allFailed && !rateLimited)) {
      console.error("poll-airport-traffic: provider refused every lookup. Flight board will go stale until the AviationStack key/plan is fixed.", lastProviderError);
      return new Response(JSON.stringify({
        error: "flight_provider_unavailable",
        reason: planBlocked
          ? "The flight data provider rejected the request: this API key's plan does not allow airport arrival/departure lookups (or its quota is used up). Update or upgrade the AviationStack key."
          : "Every flight lookup failed this run.",
        provider_error: lastProviderError,
        api_calls_made: apiCallsMade,
        results,
      }), {
        status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      message: `Airport traffic scan complete: ${totalFlights} flights cached across ${MONITORED_AIRPORTS.join(", ")}`,
      api_calls_made: apiCallsMade,
      rate_limit: MAX_API_CALLS_PER_RUN,
      degraded: results.some((r) => !r.success) || null,
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
