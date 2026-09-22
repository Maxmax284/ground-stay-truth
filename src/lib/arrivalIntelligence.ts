/**
 * Guest Arrival Intelligence — Stage 1 read-model (pure, no I/O, no writes).
 *
 * Doctrine encoded here:
 *  1. A journey is an ordered list of legs. Only the final leg drives operations.
 *  2. Every fact carries a source. Provider data never silently beats a human.
 *  3. Aircraft status and guest progress are two separate tracks. "Landed" never
 *     means cleared immigration, bags collected, ready, collected or checked in.
 *  4. One aircraft = one shared flight fact, however many guests are on it.
 *  5. Same situation, different role-shaped presentation. One next action each.
 */

// ── Sources and hierarchy ────────────────────────────────────────────────────

export const FACT_SOURCES = [
  "guest_stated",
  "staff_entered",
  "provider",
  "guest_reported",
  "evidence_extracted",
  "inferred",
] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

/** Higher wins. Humans outrank machines; the desk outranks everyone. */
const SOURCE_RANK: Record<FactSource, number> = {
  inferred: 1,
  evidence_extracted: 2,
  provider: 3,
  guest_stated: 4,
  guest_reported: 5,
  staff_entered: 6,
};

export function sourceRank(source: FactSource | string | null | undefined): number {
  if (!source) return 0;
  return SOURCE_RANK[source as FactSource] ?? 0;
}

/** Does `incoming` have the authority to replace `existing` without asking a human? */
export function canOverwrite(existing: FactSource | string | null, incoming: FactSource | string | null): boolean {
  if (!existing) return true;
  return sourceRank(incoming) > sourceRank(existing);
}

// ── Shared flight facts ──────────────────────────────────────────────────────

export interface FlightKeyInput {
  /** Number the ticket shows (e.g. TG6285). */
  marketedFlightNumber?: string | null;
  /** Number the metal actually flies under (e.g. BR3). */
  operatingFlightNumber?: string | null;
  /** Local date of the leg, YYYY-MM-DD. */
  flightDate: string;
  /** Arrival airport IATA, disambiguates multi-sector numbers. */
  arrivalCode?: string | null;
}

export function normalizeFlightNumber(value?: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, "").toUpperCase();
  return cleaned.length ? cleaned : null;
}

/**
 * Stable key for the physical flight. Prefers the operating number so five
 * guests holding five different codeshare numbers still share one fact.
 */
export function buildFlightKey(input: FlightKeyInput): string | null {
  const operating = normalizeFlightNumber(input.operatingFlightNumber);
  const marketed = normalizeFlightNumber(input.marketedFlightNumber);
  const number = operating ?? marketed;
  if (!number || !input.flightDate) return null;
  const arrival = (input.arrivalCode ?? "ANY").trim().toUpperCase() || "ANY";
  return `${number}:${input.flightDate}:${arrival}`;
}

export interface FlightFact {
  id?: string;
  flight_key: string;
  flight_date: string;
  marketed_flight_number: string | null;
  operating_flight_number: string | null;
  marketed_carrier: string | null;
  operating_carrier: string | null;
  airline_name: string | null;
  departure_iata: string | null;
  arrival_iata: string | null;
  departure_timezone: string | null;
  arrival_timezone: string | null;
  scheduled_departure: string | null;
  estimated_departure?: string | null;
  actual_departure?: string | null;
  scheduled_arrival: string | null;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  flight_status: string;
  delay_minutes: number;
  terminal?: string | null;
  gate?: string | null;
  last_checked_at?: string | null;
}

/**
 * Plain-language carrier line. Only mentions the operator when it differs from
 * the number on the guest's ticket — no codeshare lecture otherwise.
 */
export function describeCarrier(fact: Pick<FlightFact, "marketed_flight_number" | "operating_flight_number" | "operating_carrier" | "airline_name">): string {
  const marketed = normalizeFlightNumber(fact.marketed_flight_number);
  const operating = normalizeFlightNumber(fact.operating_flight_number);
  const operator = fact.operating_carrier ?? fact.airline_name ?? null;
  if (marketed && operating && marketed !== operating) {
    return operator
      ? `${marketed} — flown by ${operator} as ${operating}`
      : `${marketed} — flown as ${operating}`;
  }
  const single = marketed ?? operating;
  if (!single) return "Flight not on file";
  return operator ? `${single} — ${operator}` : single;
}

// ── Legs ─────────────────────────────────────────────────────────────────────

export type LegType = "flight" | "ferry" | "bus" | "road" | "other";

export interface JourneyLeg {
  id: string;
  booking_id: string;
  leg_order: number;
  leg_type: LegType | string;
  marketed_flight_number: string | null;
  operating_flight_number: string | null;
  operating_carrier: string | null;
  from_code: string | null;
  to_code: string | null;
  from_name: string | null;
  to_name: string | null;
  departure_timezone: string | null;
  arrival_timezone: string | null;
  scheduled_departure: string | null;
  scheduled_arrival: string | null;
  leg_status: string;
  is_final_leg: boolean;
  source: FactSource | string;
  confidence: string;
  flight_fact_id?: string | null;
  notes?: string | null;
}

/** Ordered legs, and the one that actually drives the pickup. */
export function orderLegs(legs: JourneyLeg[]): JourneyLeg[] {
  return [...legs].sort((a, b) => a.leg_order - b.leg_order);
}

export function getFinalLeg(legs: JourneyLeg[]): JourneyLeg | null {
  const ordered = orderLegs(legs);
  return ordered.find((l) => l.is_final_leg) ?? ordered[ordered.length - 1] ?? null;
}

/**
 * Connection risk between consecutive legs. Uses absolute instants only, so
 * timezone and date rollovers are handled by construction.
 */
export interface ConnectionRisk {
  fromLegOrder: number;
  toLegOrder: number;
  minutesBetween: number | null;
  level: "unknown" | "comfortable" | "tight" | "broken";
  message: string;
}

export function assessConnections(legs: JourneyLeg[], facts: Record<string, FlightFact> = {}): ConnectionRisk[] {
  const ordered = orderLegs(legs);
  const risks: ConnectionRisk[] = [];

  for (let i = 0; i < ordered.length - 1; i += 1) {
    const inbound = ordered[i];
    const onward = ordered[i + 1];
    const fact = inbound.flight_fact_id ? facts[inbound.flight_fact_id] : undefined;
    const inboundArrival =
      fact?.actual_arrival ?? fact?.estimated_arrival ?? fact?.scheduled_arrival ?? inbound.scheduled_arrival;
    const onwardDeparture = onward.scheduled_departure;

    if (!inboundArrival || !onwardDeparture) {
      risks.push({
        fromLegOrder: inbound.leg_order,
        toLegOrder: onward.leg_order,
        minutesBetween: null,
        level: "unknown",
        message: "Times for one of these legs are missing — connection can't be checked yet.",
      });
      continue;
    }

    const minutes = Math.round((new Date(onwardDeparture).getTime() - new Date(inboundArrival).getTime()) / 60000);
    const isDomesticHandoff = onward.leg_type === "ferry" || onward.leg_type === "bus";
    const tightThreshold = isDomesticHandoff ? 120 : 90;

    let level: ConnectionRisk["level"] = "comfortable";
    let message = "Connection looks comfortable.";
    if (minutes < 0) {
      level = "broken";
      message = "The onward leg leaves before this one arrives. Needs a human decision.";
    } else if (minutes < tightThreshold) {
      level = "tight";
      message = `Only ${minutes} minutes between legs — may not make it.`;
    }

    risks.push({ fromLegOrder: inbound.leg_order, toLegOrder: onward.leg_order, minutesBetween: minutes, level, message });
  }

  return risks;
}

// ── Aircraft track vs guest track ────────────────────────────────────────────

export type AircraftStatus = "unknown" | "scheduled" | "in_air" | "landed" | "delayed" | "diverted" | "cancelled";

export function readAircraftStatus(fact?: FlightFact | null): { status: AircraftStatus; delayMinutes: number } {
  if (!fact) return { status: "unknown", delayMinutes: 0 };
  const raw = (fact.flight_status ?? "unknown").toLowerCase();
  const map: Record<string, AircraftStatus> = {
    scheduled: "scheduled",
    active: "in_air",
    in_air: "in_air",
    landed: "landed",
    cancelled: "cancelled",
    diverted: "diverted",
    incident: "diverted",
  };
  const status = map[raw] ?? "unknown";
  const delay = fact.delay_minutes ?? 0;
  if (status === "scheduled" && delay >= 15) return { status: "delayed", delayMinutes: delay };
  return { status, delayMinutes: delay };
}

/**
 * Guest progress. Every step past "travelling" requires a deliberate human
 * action — aircraft telemetry can never advance this ladder.
 */
export const GUEST_STEPS = [
  "details_needed",
  "details_confirmed",
  "travelling",
  "self_reported_landed",
  "ready_for_pickup",
  "collected",
  "checked_in",
] as const;
export type GuestStep = (typeof GUEST_STEPS)[number];

export interface GuestProgressInput {
  /** Guest tapped "I've landed" — a self-report, not a location. */
  guestLandedAt?: string | null;
  /** Guest tapped "I'm ready" (bags, immigration done, standing at the point). */
  guestReadyAt?: string | null;
  /** Staff/driver tapped "Collected". */
  collectedAt?: string | null;
  /** Booking reached checked_in. */
  checkedIn?: boolean;
  /** Final operational leg is locked in. */
  finalLegConfirmed?: boolean;
  /** Any leg on file at all. */
  hasAnyLeg?: boolean;
}

export function readGuestStep(input: GuestProgressInput): GuestStep {
  if (input.checkedIn) return "checked_in";
  if (input.collectedAt) return "collected";
  if (input.guestReadyAt) return "ready_for_pickup";
  if (input.guestLandedAt) return "self_reported_landed";
  if (input.finalLegConfirmed) return "travelling";
  if (input.hasAnyLeg) return "details_confirmed";
  return "details_needed";
}

export const GUEST_STEP_LABEL: Record<GuestStep, string> = {
  details_needed: "Travel details needed",
  details_confirmed: "Travel details on file",
  travelling: "On the way",
  self_reported_landed: "Told us they landed",
  ready_for_pickup: "Ready for pickup",
  collected: "Collected",
  checked_in: "Checked in",
};

// ── Conflicts (detected, never auto-applied) ─────────────────────────────────

export interface ConflictCandidate {
  fieldName: string;
  existingValue: string | null;
  existingSource: FactSource | string | null;
  incomingValue: string | null;
  incomingSource: FactSource | string | null;
  severity: "info" | "warning" | "critical";
  message: string;
}

const CRITICAL_FIELDS = new Set(["arrival_airport", "to_code", "scheduled_arrival", "operating_flight_number"]);

/**
 * Compare a stored fact with an incoming one. Returns what a human must decide.
 * Anything returned here is a question, not an update.
 */
export function detectConflicts(
  existing: Record<string, unknown>,
  existingSource: FactSource | string,
  incoming: Record<string, unknown>,
  incomingSource: FactSource | string,
  fields: string[],
): ConflictCandidate[] {
  const out: ConflictCandidate[] = [];

  for (const field of fields) {
    const before = existing[field];
    const after = incoming[field];
    if (after === undefined || after === null || after === "") continue;
    if (before === undefined || before === null || before === "") continue;

    const a = String(before).trim().toUpperCase();
    const b = String(after).trim().toUpperCase();
    if (a === b) continue;

    // Timestamps: only flag a meaningful shift.
    if (field.includes("arrival") || field.includes("departure")) {
      const beforeMs = Date.parse(String(before));
      const afterMs = Date.parse(String(after));
      if (!Number.isNaN(beforeMs) && !Number.isNaN(afterMs)) {
        const driftMinutes = Math.abs(afterMs - beforeMs) / 60000;
        if (driftMinutes < 15) continue;
      }
    }

    const machineVsHuman = !canOverwrite(existingSource, incomingSource);
    out.push({
      fieldName: field,
      existingValue: String(before),
      existingSource,
      incomingValue: String(after),
      incomingSource,
      severity: CRITICAL_FIELDS.has(field) ? "critical" : machineVsHuman ? "warning" : "info",
      message: machineVsHuman
        ? "New data disagrees with what a person entered. A human decides."
        : "New data updates a lower-confidence value. Confirm to apply.",
    });
  }

  return out;
}

// ── Role-shaped situation ────────────────────────────────────────────────────

export type ArrivalRole = "guest" | "front_desk" | "driver" | "manager" | "admin";

export interface ArrivalSituationInput {
  legs: JourneyLeg[];
  facts: Record<string, FlightFact>;
  progress: GuestProgressInput;
  openConflicts: number;
  driverAssigned: boolean;
  driverName?: string | null;
  driverPlate?: string | null;
  meetingPoint?: string | null;
  staffContact?: string | null;
  pickupRequested: boolean;
  factLastCheckedAt?: string | null;
  stalenessMinutes?: number;
  /** Airport code on the pickup record, if staff set one. Compared, never applied. */
  pickupAirportCode?: string | null;
  /** Arrival time on the pickup record staff would actually drive to. */
  pickupArrivalTime?: string | null;
}

// ── Attention checks (structured, staff-facing, never auto-applied) ───────────

export type AttentionCode =
  | "no_travel_details"
  | "missing_island_leg"
  | "final_airport_mismatch"
  | "landed_not_ready"
  | "pickup_no_arrival_time"
  | "pickup_no_driver"
  | "stale_flight_data"
  | "details_to_confirm"
  | "broken_connection"
  | "flight_disrupted";

export interface AttentionCheck {
  code: AttentionCode;
  severity: "info" | "warning" | "critical";
  /** One plain sentence. No jargon, no aviation-speak. */
  message: string;
  /** The single human verb this check invites. Never an automatic action. */
  action: string | null;
}

/** Codes that mean the guest has actually reached the island. */
const ISLAND_CODES = new Set(["USM", "SAMUI", "NATHON", "MAENAM", "BIGBUDDHA", "LIPANOI", "KOHSAMUI"]);

function code(value?: string | null): string | null {
  const v = (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return v || null;
}

/**
 * Situational scaffolding: what a person should look at, derived only from
 * facts already on file. Returns questions, never changes.
 */
export function detectArrivalAttention(input: {
  legs: JourneyLeg[];
  finalLeg: JourneyLeg | null;
  finalFact: FlightFact | null;
  aircraft: { status: AircraftStatus; delayMinutes: number };
  guestStep: GuestStep;
  connections: ConnectionRisk[];
  dataIsStale: boolean;
  openConflicts: number;
  pickupRequested: boolean;
  driverAssigned: boolean;
  pickupAirportCode?: string | null;
  pickupArrivalTime?: string | null;
  guestReadyAt?: string | null;
}): AttentionCheck[] {
  const out: AttentionCheck[] = [];

  if (!input.legs.length) {
    out.push({
      code: "no_travel_details",
      severity: "warning",
      message: "No travel details on file for this guest.",
      action: "Confirm details",
    });
  }

  const finalCode = code(input.finalLeg?.to_code);
  if (input.legs.length && finalCode && !ISLAND_CODES.has(finalCode)) {
    out.push({
      code: "missing_island_leg",
      severity: "warning",
      message: `Their journey stops at ${finalCode} — how they reach Samui is not on file.`,
      action: "Confirm details",
    });
  }

  const pickupCode = code(input.pickupAirportCode);
  if (pickupCode && finalCode && pickupCode !== finalCode) {
    out.push({
      code: "final_airport_mismatch",
      severity: "critical",
      message: `Pickup is set for ${pickupCode} but their last leg arrives at ${finalCode}.`,
      action: "Confirm details",
    });
  }

  const landed = input.aircraft.status === "landed" || input.guestStep === "self_reported_landed";
  if (landed && !input.guestReadyAt && input.guestStep !== "ready_for_pickup" && input.guestStep !== "collected" && input.guestStep !== "checked_in") {
    out.push({
      code: "landed_not_ready",
      severity: "info",
      message: "Plane is down. The guest has not said they're out with their bags yet.",
      action: null,
    });
  }

  if (input.pickupRequested) {
    const actionable =
      input.pickupArrivalTime ??
      input.finalFact?.estimated_arrival ??
      input.finalFact?.scheduled_arrival ??
      input.finalLeg?.scheduled_arrival ??
      null;
    if (!actionable) {
      out.push({
        code: "pickup_no_arrival_time",
        severity: "critical",
        message: "Pickup is on but there is no arrival time anyone can drive to.",
        action: "Confirm details",
      });
    }
    if (!input.driverAssigned) {
      out.push({
        code: "pickup_no_driver",
        severity: "warning",
        message: "Pickup requested, no driver assigned.",
        action: "Assign pickup",
      });
    }
  }

  if (input.dataIsStale) {
    out.push({
      code: "stale_flight_data",
      severity: "warning",
      message: "Flight updates are out of date — treat the times as unconfirmed.",
      action: null,
    });
  }

  if (input.openConflicts > 0) {
    out.push({
      code: "details_to_confirm",
      severity: "warning",
      message: `${input.openConflicts} travel detail${input.openConflicts === 1 ? "" : "s"} disagree and need a person to decide.`,
      action: "Confirm details",
    });
  }

  if (input.connections.some((c) => c.level === "broken")) {
    out.push({
      code: "broken_connection",
      severity: "critical",
      message: "Their onward connection does not work as booked.",
      action: "Noted",
    });
  }

  if (input.aircraft.status === "cancelled" || input.aircraft.status === "diverted") {
    out.push({
      code: "flight_disrupted",
      severity: "critical",
      message: "Flight is cancelled or diverted. Nothing was changed automatically.",
      action: "Noted",
    });
  }

  return out;
}

export interface RoleView {
  /** One line, readable in two seconds. */
  headline: string;
  /** One supporting line. Never jargon. */
  detail: string;
  /** The single human verb offered. */
  action: string | null;
  severity: "info" | "warning" | "success" | "muted" | "critical";
}

export interface ArrivalSituation {
  finalLeg: JourneyLeg | null;
  finalFact: FlightFact | null;
  aircraft: { status: AircraftStatus; delayMinutes: number };
  guestStep: GuestStep;
  connections: ConnectionRisk[];
  dataIsStale: boolean;
  exceptions: string[];
  views: Record<ArrivalRole, RoleView>;
}

export function buildArrivalSituation(input: ArrivalSituationInput): ArrivalSituation {
  const finalLeg = getFinalLeg(input.legs);
  const finalFact = finalLeg?.flight_fact_id ? input.facts[finalLeg.flight_fact_id] ?? null : null;
  const aircraft = readAircraftStatus(finalFact);
  const guestStep = readGuestStep({
    ...input.progress,
    hasAnyLeg: input.legs.length > 0,
    finalLegConfirmed: input.progress.finalLegConfirmed ?? !!finalLeg,
  });
  const connections = assessConnections(input.legs, input.facts);

  const staleness = input.stalenessMinutes ?? 45;
  const dataIsStale = input.factLastCheckedAt
    ? (Date.now() - new Date(input.factLastCheckedAt).getTime()) / 60000 > staleness
    : input.legs.length > 0 && !!finalLeg && finalLeg.leg_type === "flight" && !finalFact;

  const exceptions: string[] = [];
  if (!input.legs.length) exceptions.push("No travel details on file.");
  if (input.pickupRequested && !input.driverAssigned) exceptions.push("Pickup requested, no driver assigned.");
  if (input.openConflicts > 0) exceptions.push(`${input.openConflicts} detail${input.openConflicts === 1 ? "" : "s"} to confirm.`);
  if (connections.some((c) => c.level === "broken")) exceptions.push("Onward connection does not work.");
  if (connections.some((c) => c.level === "tight")) exceptions.push("Tight onward connection.");
  if (aircraft.status === "diverted" || aircraft.status === "cancelled") exceptions.push("Flight cancelled or diverted.");
  if (aircraft.delayMinutes >= 30) exceptions.push(`Flight running ${aircraft.delayMinutes} minutes late.`);
  if (dataIsStale) exceptions.push("Flight updates are out of date.");
  if (guestStep === "self_reported_landed" && !input.driverAssigned) exceptions.push("Guest says they landed, no driver assigned.");

  const arrivalPlace = finalLeg?.to_name ?? finalLeg?.to_code ?? "Koh Samui";
  const driverLine = input.driverAssigned
    ? `${input.driverName ?? "Your driver"}${input.driverPlate ? ` · ${input.driverPlate}` : ""}`
    : "Driver not assigned yet";

  const guestView: RoleView = (() => {
    switch (guestStep) {
      case "details_needed":
        return {
          headline: "Tell us how you're getting here",
          detail: "Add your flight or ferry so we can meet you at the right place.",
          action: "Confirm details",
          severity: "warning",
        };
      case "details_confirmed":
        return {
          headline: `We have you arriving into ${arrivalPlace}`,
          detail: input.openConflicts > 0 ? "One detail needs your confirmation." : "Nothing to do right now — we'll watch it for you.",
          action: input.openConflicts > 0 ? "Confirm details" : null,
          severity: input.openConflicts > 0 ? "warning" : "info",
        };
      case "travelling":
        return {
          headline: aircraft.status === "landed" ? "Welcome to Thailand" : `On the way to ${arrivalPlace}`,
          detail:
            aircraft.status === "landed"
              ? "Take your time through immigration and bags. Tap when you're out and ready."
              : aircraft.delayMinutes >= 30
                ? `Running about ${aircraft.delayMinutes} minutes behind. We've adjusted your pickup.`
                : `${driverLine}. ${input.meetingPoint ?? "Meeting point will be confirmed."}`,
          action: aircraft.status === "landed" ? "I'm ready" : null,
          severity: aircraft.status === "landed" ? "success" : "info",
        };
      case "self_reported_landed":
        return {
          headline: "Thanks — we know you've landed",
          detail: `Tap when you're through immigration and have your bags. ${driverLine}.`,
          action: "I'm ready",
          severity: "info",
        };
      case "ready_for_pickup":
        return {
          headline: "Head to the meeting point",
          detail: `${driverLine}. ${input.meetingPoint ?? "Front desk will confirm where to stand."}`,
          action: null,
          severity: "success",
        };
      case "collected":
        return { headline: "You're with your driver", detail: "Next stop: camp. Reception is expecting you.", action: null, severity: "success" };
      case "checked_in":
        return { headline: "You're checked in", detail: "Have a good stay.", action: null, severity: "muted" };
    }
  })();

  const deskAction =
    guestStep === "ready_for_pickup" || guestStep === "self_reported_landed"
      ? input.driverAssigned
        ? "Collected"
        : "Assign pickup"
      : input.pickupRequested && !input.driverAssigned
        ? "Assign pickup"
        : input.openConflicts > 0
          ? "Confirm details"
          : guestStep === "collected"
            ? "Checked in"
            : null;

  const situation: ArrivalSituation = {
    finalLeg,
    finalFact,
    aircraft,
    guestStep,
    connections,
    dataIsStale,
    exceptions,
    views: {
      guest: guestView,
      front_desk: {
        headline: `${GUEST_STEP_LABEL[guestStep]} · ${arrivalPlace}`,
        detail: exceptions.length ? exceptions[0] : driverLine,
        action: deskAction,
        severity: exceptions.length ? "warning" : "info",
      },
      driver: {
        headline: input.meetingPoint ?? `Pick up at ${arrivalPlace}`,
        detail:
          guestStep === "ready_for_pickup"
            ? "Guest is out and waiting."
            : guestStep === "self_reported_landed"
              ? "Guest has landed, still clearing immigration and bags."
              : "Guest not out yet.",
        action: guestStep === "ready_for_pickup" ? "Collected" : null,
        severity: guestStep === "ready_for_pickup" ? "success" : "muted",
      },
      manager: {
        headline: exceptions.length ? `${exceptions.length} thing${exceptions.length === 1 ? "" : "s"} to look at` : "Nothing needs you",
        detail: exceptions.length ? exceptions.join(" ") : "Arrival is on track.",
        action: exceptions.length ? "Noted" : null,
        severity: exceptions.some((e) => e.includes("does not work") || e.includes("cancelled")) ? "critical" : exceptions.length ? "warning" : "muted",
      },
      admin: {
        headline: exceptions.length ? `${exceptions.length} open · ${input.openConflicts} to confirm` : "Arrival data healthy",
        detail: `${finalFact ? describeCarrier(finalFact) : "No flight fact linked"} · source ${finalLeg?.source ?? "none"}${dataIsStale ? " · data stale" : ""}`,
        action: input.openConflicts > 0 ? "Confirm details" : null,
        severity: dataIsStale || input.openConflicts > 0 ? "warning" : "muted",
      },
    },
  };

  return situation;
}
