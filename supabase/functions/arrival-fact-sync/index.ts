// arrival-fact-sync
// -----------------------------------------------------------------------------
// Guest Arrival Intelligence — shared flight facts with dual-provider telemetry.
// Staff-only.
//
// Takes a journey leg, resolves ONE shared flight fact for the physical flight
// (keyed on operating number + date + arrival airport, so five guests on the
// same aircraft cost one provider call), links the leg to that fact, and records
// any disagreement as an open row in `arrival_conflicts`.
//
// Provider policy (see _shared/flightProviders.ts):
//   AeroAPI primary → AviationStack on availability failover only.
//   Daily paid ceiling enforced. Concurrency lock stops duplicate paid reads.
//
// Hard rules:
//  - Never touches bookings, payments, units, or pickup status.
//  - Never overwrites a value whose source outranks the provider.
//  - Empty provider data reads "no flight data on record", never "on time".
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  acquireFlightLock,
  buildFlightKey,
  clean,
  lookupFlight,
  logProviderRead,
  releaseFlightLock,
} from "../_shared/flightProviders.ts";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  return false;
}

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };
}

/** A shared fact this fresh is reused for every guest on the flight. */
const FACT_FRESH_MINUTES = 10;

const SOURCE_RANK: Record<string, number> = {
  inferred: 1,
  evidence_extracted: 2,
  provider: 3,
  guest_stated: 4,
  guest_reported: 5,
  staff_entered: 6,
};

const CRITICAL_FIELDS = new Set(["to_code", "scheduled_arrival", "operating_flight_number"]);
const TERMINAL_STATES = ["landed", "cancelled", "diverted"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  let heldLock: string | null = null;
  let admin: any = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors(req) });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors(req) });
    }

    admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "manager", "front_desk_supervisor", "front_desk"]);
    if (!roles?.length) {
      return new Response(JSON.stringify({ error: "Staff only" }), { status: 403, headers: cors(req) });
    }

    const { leg_id, force_refresh } = await req.json();
    if (!leg_id || typeof leg_id !== "string") {
      return new Response(JSON.stringify({ error: "leg_id required" }), { status: 400, headers: cors(req) });
    }

    const { data: leg, error: legError } = await admin
      .from("journey_legs")
      .select("*")
      .eq("id", leg_id)
      .maybeSingle();
    if (legError) throw legError;
    if (!leg) return new Response(JSON.stringify({ error: "Leg not found" }), { status: 404, headers: cors(req) });
    if (leg.leg_type !== "flight") {
      return new Response(JSON.stringify({ ok: true, skipped: "not a flight leg" }), { headers: cors(req) });
    }

    const marketed = clean(leg.marketed_flight_number);
    const operating = clean(leg.operating_flight_number);
    if (!marketed && !operating) {
      return new Response(JSON.stringify({ ok: true, skipped: "no flight number on this leg" }), { headers: cors(req) });
    }

    const flightDate = (leg.scheduled_departure ?? leg.scheduled_arrival ?? new Date().toISOString()).slice(0, 10);
    const arrivalCode = clean(leg.to_code);
    const lookupNumber = operating ?? marketed!;

    // 1. Reuse an existing shared fact when it is fresh — this is the dedupe.
    let factKey = buildFlightKey(operating, marketed, flightDate, arrivalCode);
    let { data: existingFact } = await admin.from("flight_facts").select("*").eq("flight_key", factKey!).maybeSingle();

    const factIsFresh = existingFact?.last_checked_at
      ? (Date.now() - new Date(existingFact.last_checked_at).getTime()) / 60000 < FACT_FRESH_MINUTES
      : false;
    const isTerminal = TERMINAL_STATES.includes(existingFact?.flight_status ?? "");

    let lookup: Awaited<ReturnType<typeof lookupFlight>> | null = null;
    const wantsProvider = !existingFact || (!factIsFresh && !isTerminal) || force_refresh === true;

    if (wantsProvider && factKey) {
      // Concurrency lock: two staff tapping refresh must not buy two reads.
      const gotLock = await acquireFlightLock(admin, factKey);
      if (!gotLock) {
        await logProviderRead(admin, {
          provider: "aeroapi",
          paid: false,
          flight_key: factKey,
          leg_id: leg.id,
          booking_id: leg.booking_id,
          outcome: "lock_held_elsewhere",
          requested_by: user.id,
        });
      } else {
        heldLock = factKey;
        lookup = await lookupFlight(admin, {
          flightNumber: lookupNumber,
          flightDate,
          arrivalCode,
          flightKey: factKey,
          legId: leg.id,
          bookingId: leg.booking_id,
          requestedBy: user.id,
        });
      }
    }

    const conflictsToRecord: Array<Record<string, unknown>> = [];
    const flight = lookup?.flight ?? null;

    if (flight) {
      const record = {
        flight_key: buildFlightKey(
          flight.operating_flight_number,
          flight.marketed_flight_number,
          flightDate,
          flight.arrival_iata ?? arrivalCode,
        )!,
        flight_date: flightDate,
        marketed_flight_number: flight.marketed_flight_number,
        operating_flight_number: flight.operating_flight_number,
        marketed_carrier: flight.marketed_carrier,
        operating_carrier: flight.operating_carrier,
        airline_name: flight.airline_name,
        departure_iata: flight.departure_iata,
        arrival_iata: flight.arrival_iata,
        departure_airport: flight.departure_airport,
        arrival_airport: flight.arrival_airport,
        departure_timezone: flight.departure_timezone,
        arrival_timezone: flight.arrival_timezone,
        scheduled_departure: flight.scheduled_departure,
        estimated_departure: flight.estimated_departure,
        actual_departure: flight.actual_departure,
        scheduled_arrival: flight.scheduled_arrival,
        estimated_arrival: flight.estimated_arrival,
        actual_arrival: flight.actual_arrival,
        flight_status: flight.flight_status,
        delay_minutes: flight.delay_minutes,
        terminal: flight.terminal,
        gate: flight.gate,
        provider: flight.provider,
        raw_response: flight.raw_response,
        last_checked_at: new Date().toISOString(),
      };

      // Provenance guard: compare provider truth against the human-entered leg.
      const legVsProvider: Array<[string, unknown, unknown]> = [
        ["to_code", leg.to_code, record.arrival_iata],
        ["operating_flight_number", operating, record.operating_flight_number],
        ["scheduled_arrival", leg.scheduled_arrival, record.scheduled_arrival],
      ];

      const legRank = SOURCE_RANK[leg.source] ?? 0;
      const providerRank = SOURCE_RANK.provider;

      for (const [field, before, after] of legVsProvider) {
        if (!before || !after) continue;
        const a = String(before).trim().toUpperCase();
        const b = String(after).trim().toUpperCase();
        if (a === b) continue;
        if (field === "scheduled_arrival") {
          const drift = Math.abs(Date.parse(String(after)) - Date.parse(String(before))) / 60000;
          if (Number.isFinite(drift) && drift < 15) continue;
        }
        conflictsToRecord.push({
          booking_id: leg.booking_id,
          leg_id: leg.id,
          field_name: field,
          existing_value: String(before),
          existing_source: leg.source,
          incoming_value: String(after),
          incoming_source: "provider",
          severity: CRITICAL_FIELDS.has(field) ? "critical" : "warning",
          note:
            providerRank > legRank
              ? `Live flight data (${flight.provider}) updates a lower-confidence value. Confirm to apply.`
              : `Live flight data (${flight.provider}) disagrees with what a person entered. A human decides.`,
        });
      }

      const { data: upserted, error: upsertError } = await admin
        .from("flight_facts")
        .upsert(record, { onConflict: "flight_key" })
        .select("*")
        .single();
      if (upsertError) throw upsertError;
      existingFact = upserted;
      factKey = record.flight_key;

      await admin
        .from("flight_facts")
        .update({ lookup_count: (upserted.lookup_count ?? 0) + 1 })
        .eq("id", upserted.id);
    }

    // 2. Link the leg to the shared fact. No other leg field is touched.
    if (existingFact && leg.flight_fact_id !== existingFact.id) {
      const { error: linkError } = await admin
        .from("journey_legs")
        .update({ flight_fact_id: existingFact.id })
        .eq("id", leg.id);
      if (linkError) throw linkError;
    }

    // 3. Record conflicts as open questions, skipping duplicates.
    let conflictsOpened = 0;
    for (const conflict of conflictsToRecord) {
      const { data: dupe } = await admin
        .from("arrival_conflicts")
        .select("id")
        .eq("leg_id", leg.id)
        .eq("field_name", conflict.field_name as string)
        .eq("incoming_value", conflict.incoming_value as string)
        .eq("status", "open")
        .maybeSingle();
      if (dupe) continue;
      const { error: insertError } = await admin.from("arrival_conflicts").insert(conflict);
      if (!insertError) conflictsOpened += 1;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        flight_key: factKey,
        shared_fact_id: existingFact?.id ?? null,
        source: flight ? flight.provider : existingFact ? "shared_cache" : "none",
        providers_tried: lookup?.provider_tried ?? [],
        provider_outcome: lookup?.outcome ?? (existingFact ? "cache_fresh" : "not_attempted"),
        paid_reads_used: lookup?.paid_reads_used ?? 0,
        conflicts_opened: conflictsOpened,
        note: "Read-model only. No booking, payment, room or pickup status was changed.",
      }),
      { headers: cors(req) },
    );
  } catch (error) {
    console.error("arrival-fact-sync error", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }), {
      status: 500,
      headers: cors(req),
    });
  } finally {
    if (heldLock && admin) {
      try { await releaseFlightLock(admin, heldLock); } catch { /* lock expires on its own */ }
    }
  }
});
