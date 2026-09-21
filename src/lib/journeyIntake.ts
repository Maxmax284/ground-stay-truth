/**
 * Guest Arrival Intelligence — Stage 2 intake rules (pure, no I/O).
 *
 * Doctrine encoded here:
 *  1. Intake enriches. It never destroys. An empty field may be filled by a
 *     confident machine reading; a field a human set is never overwritten
 *     silently — it becomes a conflict a person decides.
 *  2. An international arrival is never assumed to be the arrival in Koh Samui.
 *     If the journey stops short, we ask for the onward leg.
 *  3. A ticket number is not the aircraft. Marketed numbers resolve to the
 *     operating number so guests on one aircraft share one fact.
 *  4. Booking references are secrets. They are stored masked and never shown in
 *     staff lists or notifications.
 *  5. Nothing here touches bookings, pickups, rooms, payments or check-in.
 */

import { canOverwrite, normalizeFlightNumber, type FactSource, type JourneyLeg, type LegType } from "@/lib/arrivalIntelligence";

/** Where a guest is actually "here". Anything else is still travelling. */
export const SAMUI_ARRIVAL_CODES = ["USM", "SAMUI", "NATHON", "MAENAM", "BIGBUDDHA", "LIPANOI"] as const;

/** Codes that mean "mainland" — a stop on the way, never the destination. */
export const MAINLAND_GATEWAY_CODES = ["BKK", "DMK", "HKT", "CNX", "URT", "KBV", "SIN", "KUL", "TPE", "DONSAK"] as const;

export const LEG_TYPES: LegType[] = ["flight", "ferry", "bus", "road", "other"];

export interface DraftLeg {
  leg_order: number;
  leg_type: LegType;
  marketed_flight_number?: string | null;
  operating_flight_number?: string | null;
  marketed_carrier?: string | null;
  operating_carrier?: string | null;
  from_code?: string | null;
  to_code?: string | null;
  from_name?: string | null;
  to_name?: string | null;
  scheduled_departure?: string | null;
  scheduled_arrival?: string | null;
  notes?: string | null;
  is_final_leg?: boolean;
  confidence?: "low" | "medium" | "high" | "unknown";
}

export function normalizeCode(value?: string | null): string | null {
  if (!value) return null;
  const out = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return out.length ? out : null;
}

export function isSamuiArrival(code?: string | null): boolean {
  const c = normalizeCode(code);
  if (!c) return false;
  return (SAMUI_ARRIVAL_CODES as readonly string[]).includes(c);
}

/**
 * The guest's journey stops short of the island. Never infer the onward hop —
 * ask for it.
 */
export function needsOnwardTravel(legs: Array<Pick<DraftLeg, "leg_order" | "to_code" | "leg_type">>): boolean {
  if (!legs.length) return false;
  const ordered = [...legs].sort((a, b) => a.leg_order - b.leg_order);
  const last = ordered[ordered.length - 1];
  return !isSamuiArrival(last.to_code);
}

/** Plain-language nudge for the missing hop. Guest-readable, no jargon. */
export function onwardPrompt(lastToName?: string | null, lastToCode?: string | null): string {
  const where = lastToName || normalizeCode(lastToCode) || "the mainland";
  return `That gets you to ${where}. How do you reach Koh Samui from there — flight, ferry or driver?`;
}

/** The leg operations actually care about: the one that ends on the island. */
export function pickFinalLegOrder(legs: Array<Pick<DraftLeg, "leg_order" | "to_code">>): number | null {
  if (!legs.length) return null;
  const ordered = [...legs].sort((a, b) => a.leg_order - b.leg_order);
  const island = [...ordered].reverse().find((l) => isSamuiArrival(l.to_code));
  return (island ?? ordered[ordered.length - 1]).leg_order;
}

// ── Codeshare ────────────────────────────────────────────────────────────────

export interface CodeshareMatch {
  operatingFlightNumber: string;
  operatingCarrier: string;
}

/**
 * Small, explicit table for the codeshares we actually see on this route. The
 * provider is still asked first; this is the honest fallback, not a guess
 * generator — an unknown number returns null rather than an invention.
 */
export const KNOWN_CODESHARES: Record<string, CodeshareMatch> = {
  TG6285: { operatingFlightNumber: "BR3", operatingCarrier: "EVA Air" },
  TG6287: { operatingFlightNumber: "BR7", operatingCarrier: "EVA Air" },
  BR3: { operatingFlightNumber: "BR3", operatingCarrier: "EVA Air" },
};

export function resolveKnownCodeshare(marketed?: string | null): CodeshareMatch | null {
  const key = normalizeFlightNumber(marketed);
  if (!key) return null;
  return KNOWN_CODESHARES[key] ?? null;
}

/** Only mentions the operator when it differs from the number on the ticket. */
export function describeLegCarrier(leg: Pick<DraftLeg, "marketed_flight_number" | "operating_flight_number" | "operating_carrier">): string {
  const marketed = normalizeFlightNumber(leg.marketed_flight_number);
  const operating = normalizeFlightNumber(leg.operating_flight_number);
  const carrier = leg.operating_carrier ?? null;
  if (marketed && operating && marketed !== operating) {
    return carrier ? `${marketed} · flown by ${carrier} as ${operating}` : `${marketed} · flown as ${operating}`;
  }
  const single = marketed ?? operating;
  if (!single) return "No flight number yet";
  return carrier ? `${single} · ${carrier}` : single;
}

// ── Safe merge ───────────────────────────────────────────────────────────────

/** Fields a machine reading may never change on its own once a human set them. */
export const CONSEQUENTIAL_FIELDS = ["to_code", "scheduled_arrival", "operating_flight_number", "marketed_flight_number", "leg_type"] as const;

export const MERGEABLE_FIELDS = [
  "leg_type",
  "marketed_flight_number",
  "operating_flight_number",
  "marketed_carrier",
  "operating_carrier",
  "from_code",
  "to_code",
  "from_name",
  "to_name",
  "scheduled_departure",
  "scheduled_arrival",
] as const;

export type MergeableField = (typeof MERGEABLE_FIELDS)[number];

export interface MergeConflict {
  field: MergeableField;
  existingValue: string;
  existingSource: string;
  incomingValue: string;
  incomingSource: string;
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface MergeResult {
  /** Fields safe to write now — every one of them was empty before. */
  updates: Partial<Record<MergeableField, string | null>>;
  /** Fields a person must decide. Nothing here is applied. */
  conflicts: MergeConflict[];
  /** Filled at least one blank. */
  enriched: boolean;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function sameValue(field: MergeableField, a: unknown, b: unknown): boolean {
  const sa = String(a).trim();
  const sb = String(b).trim();
  if (sa.toUpperCase() === sb.toUpperCase()) return true;
  if (field === "scheduled_arrival" || field === "scheduled_departure") {
    const ma = Date.parse(sa);
    const mb = Date.parse(sb);
    if (Number.isFinite(ma) && Number.isFinite(mb)) return Math.abs(ma - mb) / 60000 < 15;
  }
  return false;
}

/**
 * Merge an incoming reading into a stored leg.
 *
 * Blank + confident reading  → filled, stamped with the incoming source.
 * Same value                 → nothing to do.
 * Different value            → conflict for a human. Never an overwrite here,
 *                              even when the incoming source outranks, because
 *                              a changed arrival has operational consequences.
 */
export function mergeLegFields(
  existing: Partial<Record<MergeableField, unknown>> & { source?: string | null },
  incoming: Partial<Record<MergeableField, unknown>>,
  incomingSource: FactSource | string,
  options?: { fields?: readonly MergeableField[] },
): MergeResult {
  const existingSource = (existing.source as string) ?? null;
  const fields = options?.fields ?? MERGEABLE_FIELDS;
  const updates: MergeResult["updates"] = {};
  const conflicts: MergeConflict[] = [];

  for (const field of fields) {
    const after = incoming[field];
    if (isBlank(after)) continue;
    const before = existing[field];

    if (isBlank(before)) {
      updates[field] = String(after);
      continue;
    }
    if (sameValue(field, before, after)) continue;

    const consequential = (CONSEQUENTIAL_FIELDS as readonly string[]).includes(field);
    const machineVsHuman = !canOverwrite(existingSource, incomingSource);
    conflicts.push({
      field,
      existingValue: String(before),
      existingSource: existingSource ?? "unknown",
      incomingValue: String(after),
      incomingSource: String(incomingSource),
      severity: consequential ? "critical" : machineVsHuman ? "warning" : "info",
      message: consequential
        ? "This changes where or when we meet the guest. A person confirms it."
        : machineVsHuman
          ? "This disagrees with what a person entered. A person decides."
          : "New reading differs from a lower-confidence value. Confirm to apply.",
    });
  }

  return { updates, conflicts, enriched: Object.keys(updates).length > 0 };
}

// ── Booking references are secrets ───────────────────────────────────────────

/** Keeps the last three characters so a guest recognises it; hides the rest. */
export function maskBookingReference(reference?: string | null): string | null {
  const raw = (reference ?? "").replace(/\s+/g, "").toUpperCase();
  if (!raw) return null;
  if (raw.length <= 3) return "•".repeat(raw.length);
  return `${"•".repeat(Math.max(3, raw.length - 3))}${raw.slice(-3)}`;
}

// ── Evidence extraction → draft legs ─────────────────────────────────────────

export interface ExtractionPayload {
  legs?: Array<Record<string, unknown>>;
  booking_reference?: string | null;
  passenger_name?: string | null;
  confidence?: string | null;
}

function asIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function asLegType(value: unknown): LegType {
  const v = String(value ?? "").toLowerCase();
  return (LEG_TYPES as string[]).includes(v) ? (v as LegType) : "flight";
}

/**
 * Normalise whatever the reader produced into ordered draft legs. Unusable rows
 * are dropped rather than guessed at — silence beats invention.
 */
export function legsFromExtraction(payload: ExtractionPayload): DraftLeg[] {
  const rows = Array.isArray(payload.legs) ? payload.legs : [];
  const drafts: DraftLeg[] = [];

  rows.forEach((row) => {
    const legType = asLegType(row.leg_type ?? row.type);
    const marketed = normalizeFlightNumber(String(row.flight_number ?? row.marketed_flight_number ?? "")) ?? null;
    const from = normalizeCode(String(row.from_code ?? row.from ?? row.origin ?? ""));
    const to = normalizeCode(String(row.to_code ?? row.to ?? row.destination ?? ""));
    const dep = asIso(row.scheduled_departure ?? row.departure ?? row.depart_at);
    const arr = asIso(row.scheduled_arrival ?? row.arrival ?? row.arrive_at);

    // A leg with neither a number nor a route tells us nothing usable.
    if (!marketed && !(from && to)) return;

    const known = resolveKnownCodeshare(marketed);
    drafts.push({
      leg_order: drafts.length + 1,
      leg_type: legType,
      marketed_flight_number: marketed,
      operating_flight_number: known?.operatingFlightNumber ?? null,
      operating_carrier: known?.operatingCarrier ?? (typeof row.carrier === "string" ? row.carrier : null),
      from_code: from,
      to_code: to,
      from_name: typeof row.from_name === "string" ? row.from_name : null,
      to_name: typeof row.to_name === "string" ? row.to_name : null,
      scheduled_departure: dep,
      scheduled_arrival: arr,
      confidence: marketed && dep ? "high" : marketed || (from && to) ? "medium" : "low",
    });
  });

  const finalOrder = pickFinalLegOrder(drafts);
  return drafts.map((d) => ({ ...d, is_final_leg: d.leg_order === finalOrder }));
}

/** A reading confident enough to fill blanks without asking anyone. */
export function isConfidentEnoughToEnrich(leg: DraftLeg): boolean {
  return leg.confidence === "high" || leg.confidence === "medium";
}

// ── Guest-facing readout ─────────────────────────────────────────────────────

export interface IntakeStatus {
  /** One line the guest reads in two seconds. */
  headline: string;
  /** What we need, or that we need nothing. */
  detail: string;
  /** The single verb offered. */
  action: "add_travel" | "add_onward" | "confirm_details" | null;
  complete: boolean;
}

export function readIntakeStatus(input: {
  legs: Array<Pick<JourneyLeg, "leg_order" | "to_code" | "to_name" | "leg_type">>;
  openConflicts: number;
}): IntakeStatus {
  if (!input.legs.length) {
    return {
      headline: "We don't know how you're getting here yet",
      detail: "Add your flight, ferry or driver — or upload your booking and we'll read it.",
      action: "add_travel",
      complete: false,
    };
  }
  if (needsOnwardTravel(input.legs)) {
    const ordered = [...input.legs].sort((a, b) => a.leg_order - b.leg_order);
    const last = ordered[ordered.length - 1];
    return {
      headline: "One hop missing",
      detail: onwardPrompt(last.to_name, last.to_code),
      action: "add_onward",
      complete: false,
    };
  }
  if (input.openConflicts > 0) {
    return {
      headline: "One detail needs a check",
      detail: "Something we read doesn't match what we had. We'll confirm it with you.",
      action: "confirm_details",
      complete: false,
    };
  }
  return {
    headline: "We've got your arrival",
    detail: "Nothing else to do — we watch your travel and meet you.",
    action: null,
    complete: true,
  };
}
