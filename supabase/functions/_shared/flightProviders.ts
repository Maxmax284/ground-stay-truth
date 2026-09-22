// flightProviders — dual-provider flight telemetry with a measured paid ceiling.
// -----------------------------------------------------------------------------
// AeroAPI (FlightAware v4) is the PRIMARY operational feed: dispatch-grade actual
// times, gate/terminal, cancelled/diverted, codeshare identities.
// AviationStack is the AVAILABILITY FALLBACK only — used when AeroAPI returns
// nothing, errors, or the day's ceiling is spent. We never make two paid calls
// for the same flight just to "verify"; a second read only happens on failover.
//
// Hard rules:
//  - No provider read ever changes a booking, payment, room, price, or pickup.
//  - Every paid read is logged in `flight_provider_reads` BEFORE it is used.
//  - One flight/date/airport = one shared fact; a lock stops duplicate paid reads.
//  - Empty data reads "no flight data on record", never "on time".
// -----------------------------------------------------------------------------

export const DAILY_PAID_READ_CEILING = 25;
export const LOCK_STALE_SECONDS = 30;

export type ProviderName = "aeroapi" | "aviationstack";

export interface NormalizedFlight {
  provider: ProviderName;
  marketed_flight_number: string | null;
  operating_flight_number: string | null;
  marketed_carrier: string | null;
  operating_carrier: string | null;
  airline_name: string | null;
  departure_iata: string | null;
  arrival_iata: string | null;
  departure_airport: string | null;
  arrival_airport: string | null;
  departure_timezone: string | null;
  arrival_timezone: string | null;
  scheduled_departure: string | null;
  estimated_departure: string | null;
  actual_departure: string | null;
  scheduled_arrival: string | null;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  flight_status: string;
  delay_minutes: number;
  terminal: string | null;
  gate: string | null;
  raw_response: unknown;
}

export function clean(value?: string | null): string | null {
  if (!value) return null;
  const out = String(value).replace(/\s+/g, "").toUpperCase();
  return out.length ? out : null;
}

/** One key per physical aircraft movement — five codeshare numbers converge here. */
export function buildFlightKey(
  operating: string | null,
  marketed: string | null,
  flightDate: string,
  arrivalCode: string | null,
): string | null {
  const number = clean(operating) ?? clean(marketed);
  if (!number || !flightDate) return null;
  return `${number}:${flightDate}:${(arrivalCode ?? "ANY").toUpperCase()}`;
}

const AVIATIONSTACK_STATUS: Record<string, string> = {
  scheduled: "scheduled",
  active: "in_air",
  landed: "landed",
  cancelled: "cancelled",
  incident: "incident",
  diverted: "diverted",
};

/** AeroAPI states are free text; map the ones that carry operational meaning. */
export function mapAeroStatus(raw?: string | null, cancelled?: boolean, diverted?: boolean): string {
  if (cancelled) return "cancelled";
  if (diverted) return "diverted";
  const s = String(raw ?? "").toLowerCase();
  if (!s) return "unknown";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("divert")) return "diverted";
  if (s.includes("arrived") || s.includes("landed")) return "landed";
  if (s.includes("en route") || s.includes("enroute") || s.includes("air")) return "in_air";
  if (s.includes("scheduled") || s.includes("taxi") || s.includes("gate") || s.includes("delay")) return "scheduled";
  return "unknown";
}

function minutesBetween(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  const diff = (Date.parse(a) - Date.parse(b)) / 60000;
  return Number.isFinite(diff) ? Math.max(0, Math.round(diff)) : 0;
}

export function normalizeAeroApi(flight: Record<string, any>, fallbackNumber: string): NormalizedFlight | null {
  if (!flight) return null;
  const origin = flight.origin ?? {};
  const destination = flight.destination ?? {};
  const marketed = clean(flight.ident_iata) ?? clean(flight.ident) ?? clean(fallbackNumber);
  // AeroAPI reports the OPERATING flight on the record itself; codeshares are listed.
  const operating = clean(flight.operator_iata ? `${flight.operator_iata}${String(flight.flight_number ?? "")}` : null)
    ?? marketed;

  const scheduledIn = flight.scheduled_in ?? null;
  const estimatedIn = flight.estimated_in ?? null;
  const actualIn = flight.actual_in ?? flight.actual_on ?? null;

  return {
    provider: "aeroapi",
    marketed_flight_number: marketed,
    operating_flight_number: operating,
    marketed_carrier: flight.operator_name ?? null,
    operating_carrier: flight.operator_name ?? null,
    airline_name: flight.operator_name ?? null,
    departure_iata: clean(origin.code_iata) ?? clean(origin.code),
    arrival_iata: clean(destination.code_iata) ?? clean(destination.code),
    departure_airport: origin.name ?? null,
    arrival_airport: destination.name ?? null,
    departure_timezone: origin.timezone ?? null,
    arrival_timezone: destination.timezone ?? null,
    scheduled_departure: flight.scheduled_out ?? null,
    estimated_departure: flight.estimated_out ?? null,
    actual_departure: flight.actual_out ?? flight.actual_off ?? null,
    scheduled_arrival: scheduledIn,
    estimated_arrival: estimatedIn,
    actual_arrival: actualIn,
    flight_status: mapAeroStatus(flight.status, flight.cancelled, flight.diverted),
    delay_minutes: Number(flight.arrival_delay ?? 0) > 0
      ? Math.round(Number(flight.arrival_delay) / 60)
      : minutesBetween(actualIn ?? estimatedIn, scheduledIn),
    terminal: destination.terminal ?? null,
    gate: destination.gate ?? null,
    raw_response: flight,
  };
}

export function normalizeAviationStack(row: Record<string, any>, fallbackNumber: string): NormalizedFlight | null {
  if (!row) return null;
  const codeshared = row.flight?.codeshared ?? null;
  const marketed = clean(row.flight?.iata) ?? clean(fallbackNumber);
  const operating = clean(codeshared?.flight_iata) ?? marketed;
  return {
    provider: "aviationstack",
    marketed_flight_number: marketed,
    operating_flight_number: operating,
    marketed_carrier: row.airline?.name ?? null,
    operating_carrier: codeshared?.airline_name ?? row.airline?.name ?? null,
    airline_name: row.airline?.name ?? null,
    departure_iata: clean(row.departure?.iata),
    arrival_iata: clean(row.arrival?.iata),
    departure_airport: row.departure?.airport ?? null,
    arrival_airport: row.arrival?.airport ?? null,
    departure_timezone: row.departure?.timezone ?? null,
    arrival_timezone: row.arrival?.timezone ?? null,
    scheduled_departure: row.departure?.scheduled ?? null,
    estimated_departure: row.departure?.estimated ?? null,
    actual_departure: row.departure?.actual ?? null,
    scheduled_arrival: row.arrival?.scheduled ?? null,
    estimated_arrival: row.arrival?.estimated ?? null,
    actual_arrival: row.arrival?.actual ?? null,
    flight_status: AVIATIONSTACK_STATUS[String(row.flight_status ?? "").toLowerCase()] ?? "unknown",
    delay_minutes: Number(row.arrival?.delay ?? 0) || 0,
    terminal: row.arrival?.terminal ?? null,
    gate: row.arrival?.gate ?? null,
    raw_response: row,
  };
}

// ---------------------------------------------------------------------------
// Budget ledger + concurrency lock
// ---------------------------------------------------------------------------

/** How many paid reads are left today. Never throws — a broken ledger means no paid reads. */
export async function paidReadsRemaining(admin: any): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await admin
    .from("flight_provider_reads")
    .select("id", { count: "exact", head: true })
    .eq("read_day", today)
    .eq("paid", true);
  if (error) {
    console.warn("flightProviders: ledger unreadable, refusing paid reads", error.message);
    return 0;
  }
  return Math.max(0, DAILY_PAID_READ_CEILING - (count ?? 0));
}

export async function logProviderRead(
  admin: any,
  entry: {
    provider: ProviderName;
    paid: boolean;
    flight_key: string | null;
    leg_id?: string | null;
    booking_id?: string | null;
    outcome: string;
    http_status?: number | null;
    requested_by?: string | null;
  },
): Promise<void> {
  const { error } = await admin.from("flight_provider_reads").insert({
    read_day: new Date().toISOString().slice(0, 10),
    ...entry,
  });
  if (error) console.warn("flightProviders: could not log read", error.message);
}

/** True when this caller owns the lock. Stale locks are stolen after 30s. */
export async function acquireFlightLock(admin: any, flightKey: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await admin.from("flight_read_locks").insert({ flight_key: flightKey, locked_at: now });
  if (!error) return true;

  const { data: held } = await admin
    .from("flight_read_locks")
    .select("locked_at")
    .eq("flight_key", flightKey)
    .maybeSingle();
  if (!held?.locked_at) return false;
  const ageSeconds = (Date.now() - new Date(held.locked_at).getTime()) / 1000;
  if (ageSeconds < LOCK_STALE_SECONDS) return false;

  const { error: stealError } = await admin
    .from("flight_read_locks")
    .update({ locked_at: now })
    .eq("flight_key", flightKey)
    .eq("locked_at", held.locked_at);
  return !stealError;
}

export async function releaseFlightLock(admin: any, flightKey: string): Promise<void> {
  await admin.from("flight_read_locks").delete().eq("flight_key", flightKey);
}

// ---------------------------------------------------------------------------
// Provider calls
// ---------------------------------------------------------------------------

const AEROAPI_BASE = "https://aeroapi.flightaware.com/aeroapi";
/** Free-tier AviationStack is HTTP-only and has no date filter — we filter in code. */
const AVIATIONSTACK_BASE = "http://api.aviationstack.com/v1";

export interface LookupResult {
  flight: NormalizedFlight | null;
  provider_tried: ProviderName[];
  outcome: string;
  paid_reads_used: number;
}

async function fetchAeroApi(
  key: string,
  flightNumber: string,
  flightDate: string,
  arrivalCode: string | null,
): Promise<{ flight: NormalizedFlight | null; status: number; outcome: string }> {
  // A one-day window either side covers UTC/local date rollovers.
  const start = new Date(`${flightDate}T00:00:00Z`);
  const from = new Date(start.getTime() - 24 * 3600_000).toISOString().slice(0, 19) + "Z";
  const to = new Date(start.getTime() + 48 * 3600_000).toISOString().slice(0, 19) + "Z";
  const url = `${AEROAPI_BASE}/flights/${encodeURIComponent(flightNumber)}?start=${from}&end=${to}`;

  const resp = await fetch(url, { headers: { "x-apikey": key, Accept: "application/json" } });
  if (!resp.ok) {
    return { flight: null, status: resp.status, outcome: resp.status === 429 ? "rate_limited" : "provider_error" };
  }
  const json = await resp.json();
  const rows: any[] = Array.isArray(json?.flights) ? json.flights : [];
  if (!rows.length) return { flight: null, status: resp.status, outcome: "no_data" };

  const onDate = (r: any) => String(r?.scheduled_in ?? r?.scheduled_out ?? "").slice(0, 10) === flightDate;
  const match =
    rows.find((r) => onDate(r) && (!arrivalCode || clean(r?.destination?.code_iata) === arrivalCode)) ??
    rows.find((r) => onDate(r)) ??
    null;
  if (!match) return { flight: null, status: resp.status, outcome: "no_match_for_date" };
  return { flight: normalizeAeroApi(match, flightNumber), status: resp.status, outcome: "ok" };
}

async function fetchAviationStack(
  key: string,
  flightNumber: string,
  flightDate: string,
  arrivalCode: string | null,
): Promise<{ flight: NormalizedFlight | null; status: number; outcome: string }> {
  const url = `${AVIATIONSTACK_BASE}/flights?access_key=${key}&flight_iata=${encodeURIComponent(flightNumber)}&limit=10`;
  const resp = await fetch(url);
  if (!resp.ok) {
    return { flight: null, status: resp.status, outcome: resp.status === 429 ? "rate_limited" : "provider_error" };
  }
  const json = await resp.json();
  const rows: any[] = Array.isArray(json?.data) ? json.data : [];
  if (!rows.length) return { flight: null, status: resp.status, outcome: "no_data" };
  const match =
    rows.find((r) => r?.flight_date === flightDate && (!arrivalCode || clean(r?.arrival?.iata) === arrivalCode)) ??
    rows.find((r) => r?.flight_date === flightDate) ??
    null;
  if (!match) return { flight: null, status: resp.status, outcome: "no_match_for_date" };
  return { flight: normalizeAviationStack(match, flightNumber), status: resp.status, outcome: "ok" };
}

/**
 * AeroAPI first, AviationStack only on failover. Every paid read is logged and
 * counted against the day's ceiling before the result is used.
 */
export async function lookupFlight(
  admin: any,
  opts: {
    flightNumber: string;
    flightDate: string;
    arrivalCode: string | null;
    flightKey: string | null;
    legId?: string | null;
    bookingId?: string | null;
    requestedBy?: string | null;
  },
): Promise<LookupResult> {
  const tried: ProviderName[] = [];
  let paidUsed = 0;
  const base = {
    flight_key: opts.flightKey,
    leg_id: opts.legId ?? null,
    booking_id: opts.bookingId ?? null,
    requested_by: opts.requestedBy ?? null,
  };

  let remaining = await paidReadsRemaining(admin);
  if (remaining <= 0) {
    await logProviderRead(admin, { ...base, provider: "aeroapi", paid: false, outcome: "ceiling_reached" });
    return { flight: null, provider_tried: [], outcome: "ceiling_reached", paid_reads_used: 0 };
  }

  const aeroKey = Deno.env.get("AEROAPI_KEY");
  if (aeroKey) {
    tried.push("aeroapi");
    try {
      const result = await fetchAeroApi(aeroKey, opts.flightNumber, opts.flightDate, opts.arrivalCode);
      paidUsed += 1;
      remaining -= 1;
      await logProviderRead(admin, {
        ...base,
        provider: "aeroapi",
        paid: true,
        outcome: result.outcome,
        http_status: result.status,
      });
      if (result.flight) return { flight: result.flight, provider_tried: tried, outcome: "ok", paid_reads_used: paidUsed };
    } catch (error) {
      await logProviderRead(admin, { ...base, provider: "aeroapi", paid: true, outcome: "exception" });
      paidUsed += 1;
      remaining -= 1;
      console.warn("flightProviders: AeroAPI threw", error);
    }
  }

  const stackKey = Deno.env.get("AVIATIONSTACK_API_KEY");
  if (stackKey && remaining > 0) {
    tried.push("aviationstack");
    try {
      const result = await fetchAviationStack(stackKey, opts.flightNumber, opts.flightDate, opts.arrivalCode);
      paidUsed += 1;
      await logProviderRead(admin, {
        ...base,
        provider: "aviationstack",
        paid: true,
        outcome: result.outcome,
        http_status: result.status,
      });
      if (result.flight) {
        return { flight: result.flight, provider_tried: tried, outcome: "fallback_ok", paid_reads_used: paidUsed };
      }
    } catch (error) {
      await logProviderRead(admin, { ...base, provider: "aviationstack", paid: true, outcome: "exception" });
      paidUsed += 1;
      console.warn("flightProviders: AviationStack threw", error);
    }
  }

  // Both silent. Say so plainly — never invent "on time".
  return { flight: null, provider_tried: tried, outcome: "no_flight_data_on_record", paid_reads_used: paidUsed };
}
