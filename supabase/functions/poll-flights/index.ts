// poll-flights
// -----------------------------------------------------------------------------
// Cron. Every 15 min. Walks upcoming arrivals in the next window, batches
// AviationStack lookups, refreshes `flight_tracking`, and — when a flight
// flips to landed — kicks off `guest-landed` so the arrival journey advances.
//
// Batched + quota-aware. If AviationStack is down, this fails quiet; manual
// flight entry always overrides the API anyway.
// -----------------------------------------------------------------------------
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AVIATIONSTACK_BASE = "http://api.aviationstack.com/v1";

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

    // Get today's pickups with flight numbers that aren't in a terminal state
    // Fetch pickups with a wider window — today + tomorrow for timezone safety
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(todayStart.getTime() + 2 * 24 * 60 * 60 * 1000);

    const { data: pickups, error: pickupsError } = await serviceClient
      .from("airport_pickups")
      .select("id, flight_number, arrival_datetime, booking_id")
      .not("flight_number", "is", null)
      .gte("arrival_datetime", todayStart.toISOString())
      .lte("arrival_datetime", tomorrowEnd.toISOString())
      .in("status", ["requested", "assigned", "confirmed"])
      .limit(200); // Hard cap to prevent runaway processing

    if (pickupsError) throw pickupsError;

    if (!pickups?.length) {
      return new Response(JSON.stringify({ message: "No active flights to poll", checked: 0 }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Get existing tracking to detect status changes
    const pickupIds = pickups.map(p => p.id);
    const { data: existingTracking } = await serviceClient
      .from("flight_tracking")
      .select("pickup_id, flight_status, last_checked_at")
      .in("pickup_id", pickupIds);

    const terminalStatuses = new Set(["landed", "cancelled", "diverted"]);
    const existingStatusMap: Record<string, string> = {};
    (existingTracking ?? []).forEach(ft => { existingStatusMap[ft.pickup_id] = ft.flight_status; });

    const terminalPickupIds = new Set(
      Object.entries(existingStatusMap)
        .filter(([, status]) => terminalStatuses.has(status))
        .map(([id]) => id)
    );

    // Per-pickup cooldown: never re-poll the same flight more often than this.
    // Flights close to arrival get the tight interval, distant ones a lazy one —
    // so no single guest's flight burns the provider quota.
    const NEAR_WINDOW_MS = 6 * 60 * 60 * 1000; // within 6h of arrival = "near"
    const NEAR_COOLDOWN_MIN = 15;
    const FAR_COOLDOWN_MIN = 120;
    const lastCheckedMap: Record<string, string | null> = {};
    (existingTracking ?? []).forEach(ft => { lastCheckedMap[ft.pickup_id] = ft.last_checked_at ?? null; });

    const now = Date.now();
    let skippedCooldown = 0;

    const activePickups = pickups.filter(p => {
      if (terminalPickupIds.has(p.id)) return false;
      const last = lastCheckedMap[p.id];
      if (!last) return true;
      const minsSince = (now - new Date(last).getTime()) / 60000;
      const arrivalMs = p.arrival_datetime ? new Date(p.arrival_datetime).getTime() : Infinity;
      const isNear = Math.abs(arrivalMs - now) <= NEAR_WINDOW_MS;
      const cooldown = isNear ? NEAR_COOLDOWN_MIN : FAR_COOLDOWN_MIN;
      if (minsSince < cooldown) {
        skippedCooldown++;
        return false;
      }
      return true;
    });

    if (!activePickups.length) {
      return new Response(JSON.stringify({ message: "No flights due for a refresh (terminal state or within cooldown)", checked: 0, skipped_cooldown: skippedCooldown }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const statusMap: Record<string, string> = {
      scheduled: "scheduled",
      active: "in_air",
      landed: "landed",
      cancelled: "cancelled",
      incident: "incident",
      diverted: "diverted",
    };

    const results: Array<{ pickup_id: string; flight_number: string; status: string; success: boolean; notified?: boolean }> = [];

    // Process in priority batches: nearest arrivals first, batch of 10 for throughput
    activePickups.sort((a, b) => {
      const aTime = a.arrival_datetime ? new Date(a.arrival_datetime).getTime() : Infinity;
      const bTime = b.arrival_datetime ? new Date(b.arrival_datetime).getTime() : Infinity;
      return aTime - bTime;
    });

    const BATCH_SIZE = 10;
    // Hard provider-call ceiling per run — protects the monthly quota.
    const MAX_PROCESS = 25;
    const toProcess = activePickups.slice(0, MAX_PROCESS);
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (pickup) => {
          const cleanFlight = pickup.flight_number!.replace(/\s+/g, "").toUpperCase();

          try {
            const apiUrl = `${AVIATIONSTACK_BASE}/flights?access_key=${AVIATIONSTACK_KEY}&flight_iata=${cleanFlight}&limit=1`;
            const apiResp = await fetch(apiUrl);

            if (!apiResp.ok) {
              console.error(`API error for ${cleanFlight}:`, apiResp.status);
              return { pickup_id: pickup.id, flight_number: cleanFlight, status: "api_error", success: false };
            }

            const apiData = await apiResp.json();

            if (apiData.error || !apiData.data?.[0]) {
              return { pickup_id: pickup.id, flight_number: cleanFlight, status: "not_found", success: false };
            }

            const fd = apiData.data[0];
            const delayMinutes = fd.arrival?.delay ?? fd.departure?.delay ?? 0;
            const newStatus = statusMap[fd.flight_status] ?? fd.flight_status ?? "unknown";
            const previousStatus = existingStatusMap[pickup.id];

            const record = {
              pickup_id: pickup.id,
              flight_number: cleanFlight,
              airline_name: fd.airline?.name ?? null,
              departure_airport: fd.departure?.airport ?? null,
              departure_iata: fd.departure?.iata ?? null,
              arrival_airport: fd.arrival?.airport ?? null,
              arrival_iata: fd.arrival?.iata ?? null,
              scheduled_departure: fd.departure?.scheduled ?? null,
              estimated_departure: fd.departure?.estimated ?? null,
              actual_departure: fd.departure?.actual ?? null,
              scheduled_arrival: fd.arrival?.scheduled ?? null,
              estimated_arrival: fd.arrival?.estimated ?? null,
              actual_arrival: fd.arrival?.actual ?? null,
              flight_status: newStatus,
              delay_minutes: delayMinutes,
              terminal: fd.arrival?.terminal ?? null,
              gate: fd.arrival?.gate ?? null,
              raw_response: fd,
              last_checked_at: new Date().toISOString(),
            };

            const existing = existingTracking?.find(ft => ft.pickup_id === pickup.id);
            if (existing) {
              await serviceClient.from("flight_tracking").update(record).eq("pickup_id", pickup.id);
            } else {
              await serviceClient.from("flight_tracking").insert(record);
            }

            // Push the real arrival time (and landing airport) back onto the pickup so the
            // guest's card reflects the actual flight without anyone typing anything.
            const realArrival = record.actual_arrival ?? record.estimated_arrival ?? record.scheduled_arrival;
            const pickupPatch: Record<string, unknown> = {};
            if (realArrival) {
              const known = pickup.arrival_datetime ? new Date(pickup.arrival_datetime).getTime() : null;
              const fresh = new Date(realArrival).getTime();
              // Only write when it actually moved (>5 min) — avoids churn on every poll.
              if (!known || Math.abs(fresh - known) > 5 * 60 * 1000) {
                pickupPatch.arrival_datetime = new Date(realArrival).toISOString();
              }
            }
            if (newStatus === "landed" && record.arrival_iata) {
              pickupPatch.confirmed_airport = record.arrival_iata.toUpperCase() === "USM" ? "samui" : record.arrival_iata.toUpperCase() === "BKK" ? "bkk" : record.arrival_iata;
            }
            if (Object.keys(pickupPatch).length > 0) {
              const { error: patchError } = await serviceClient
                .from("airport_pickups")
                .update(pickupPatch)
                .eq("id", pickup.id);
              if (patchError) console.error(`Failed syncing pickup ${pickup.id} from live flight:`, patchError.message);
            }


            // Detect landed transition → notify guest
            let notified = false;
            if (newStatus === "landed" && previousStatus !== "landed") {
              notified = await notifyGuestLanded(serviceClient, supabaseUrl, pickup.booking_id, cleanFlight);
            }

            return { pickup_id: pickup.id, flight_number: cleanFlight, status: newStatus, success: true, notified };
          } catch (err) {
            console.error(`Error polling ${cleanFlight}:`, err);
            return { pickup_id: pickup.id, flight_number: cleanFlight, status: "error", success: false };
          }
        })
      );

      for (const r of batchResults) {
        results.push(r.status === "fulfilled" ? r.value : { pickup_id: "unknown", flight_number: "unknown", status: "error", success: false });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const skipped = activePickups.length - toProcess.length;
    console.log(`Poll complete: ${successCount}/${toProcess.length} flights updated${skipped > 0 ? `, ${skipped} deferred` : ""}${skippedCooldown > 0 ? `, ${skippedCooldown} on cooldown` : ""}`);

    return new Response(JSON.stringify({
      message: `Polled ${toProcess.length} flights, ${successCount} updated${skipped > 0 ? `, ${skipped} deferred to next run` : ""}`,
      checked: toProcess.length,
      deferred: skipped,
      skipped_cooldown: skippedCooldown,
      results,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("poll-flights error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

/** Notify guest that their flight has landed */
async function notifyGuestLanded(
  serviceClient: any,
  supabaseUrl: string,
  bookingId: string,
  flightNumber: string,
): Promise<boolean> {
  try {
    // Look up guest_id from booking
    const { data: booking } = await serviceClient
      .from("bookings")
      .select("guest_id")
      .eq("id", bookingId)
      .single();

    if (!booking?.guest_id) {
      console.log(`No guest_id for booking ${bookingId}, skipping notification`);
      return false;
    }

    // Create notification via edge function
    const notifResp = await fetch(`${supabaseUrl}/functions/v1/create-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        notifications: [
          {
            user_id: booking.guest_id,
            type: "flight_landed",
            message: `✈️ Your flight ${flightNumber} has landed! Tap here to confirm you're ready for pickup.`,
            reference_id: bookingId,
          },
        ],
      }),
    });

    if (!notifResp.ok) {
      console.error("Failed to create landed notification:", await notifResp.text());
      return false;
    }

    console.log(`Landed notification sent to guest ${booking.guest_id} for flight ${flightNumber}`);
    return true;
  } catch (err) {
    console.error("Error sending landed notification:", err);
    return false;
  }
}
