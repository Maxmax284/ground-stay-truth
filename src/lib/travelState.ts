/**
 * Travel State Awareness Layer
 * 
 * Centralizes the logic for interpreting a guest's current position
 * in their multi-leg journey. The system recognizes that most guests
 * arrive via international flight to Bangkok (BKK) then domestic
 * flight to Koh Samui (USM).
 * 
 * Field semantics (existing schema, unchanged):
 *   - international_flight_number: first leg (context only, not operational)
 *   - flight_number: final/domestic leg (drives pickup timing & dispatch)
 *   - final_flight_confirmed: whether the operational flight is locked in
 *   - confirmed_airport: where the guest said they landed
 *   - guest_landed_at: timestamp of "I've Landed" confirmation
 * 
 * The ONLY flight that drives operational decisions (driver dispatch,
 * arrival readiness, pickup timing) is flight_number — the final leg.
 * international_flight_number exists purely for staff context.
 */

export type TravelState =
  | "pre_departure"        // No landing, no transit — guest hasn't left yet
  | "missing_final_flight" // Has international flight but no domestic — can't schedule pickup
  | "awaiting_departure"   // Final flight known, guest hasn't landed yet
  | "in_transit_bkk"       // Guest landed in BKK, connecting flight expected
  | "arriving"             // Guest confirmed landing at final destination (USM)
  | "arrived"              // Pickup completed
  | "cancelled";           // Pickup cancelled

export interface TravelStateInfo {
  state: TravelState;
  /** Whether the system can dispatch a driver right now */
  operationallyReady: boolean;
  /** Whether the international flight provides context but NOT timing */
  hasContextFlight: boolean;
  /** Whether the final/domestic flight is the source of truth for pickup */
  hasFinalFlight: boolean;
  /** Whether the guest is between legs (BKK landed, USM pending) */
  isInTransit: boolean;
  /** Staff-facing summary */
  staffLabel: string;
  /** Staff-facing detail */
  staffDetail: string;
  /** Guest-facing guidance message */
  guestGuidance: string;
  /** Severity for UI treatment */
  severity: "info" | "warning" | "success" | "muted" | "destructive";
}

export interface PickupData {
  status: string;
  flight_number: string | null;
  international_flight_number: string | null;
  final_flight_confirmed: boolean;
  confirmed_airport: string | null;
  guest_landed_at: string | null;
  arrival_datetime: string | null;
}

/**
 * Compute the guest's travel state from pickup data.
 * This is the single source of truth for "where is this guest in their journey?"
 */
export function getTravelState(pickup: PickupData): TravelStateInfo {
  const {
    status,
    flight_number: finalFlight,
    international_flight_number: intlFlight,
    confirmed_airport,
    guest_landed_at,
  } = pickup;

  const hasContextFlight = !!intlFlight;
  const hasFinalFlight = !!finalFlight;
  const confirmedAirportLower = confirmed_airport?.toLowerCase() ?? null;
  const hasLanded = !!guest_landed_at;
  const isInTransit = hasLanded && confirmedAirportLower === "bkk" && hasContextFlight;

  // Terminal states
  if (status === "cancelled") {
    return {
      state: "cancelled",
      operationallyReady: false,
      hasContextFlight,
      hasFinalFlight,
      isInTransit: false,
      staffLabel: "Cancelled",
      staffDetail: "This pickup has been cancelled.",
      guestGuidance: "",
      severity: "muted",
    };
  }

  if (status === "completed") {
    return {
      state: "arrived",
      operationallyReady: false,
      hasContextFlight,
      hasFinalFlight,
      isInTransit: false,
      staffLabel: "Completed",
      staffDetail: "Guest has arrived and pickup is complete.",
      guestGuidance: "Welcome! Your pickup is complete.",
      severity: "success",
    };
  }

  // Guest is in transit at BKK — NOT ready for dispatch
  if (isInTransit) {
    return {
      state: "in_transit_bkk",
      operationallyReady: false,
      hasContextFlight,
      hasFinalFlight,
      isInTransit: true,
      staffLabel: "In Transit (BKK)",
      staffDetail: hasFinalFlight
        ? `Guest landed in Bangkok. Connecting via ${finalFlight} to Koh Samui. Do NOT dispatch driver yet.`
        : `Guest landed in Bangkok but final flight to Samui is not confirmed. Await domestic flight details.`,
      guestGuidance: hasFinalFlight
        ? `You've landed in Bangkok! Your connecting flight ${finalFlight} to Koh Samui is confirmed. Your driver will meet you at Samui airport.`
        : "You've landed in Bangkok! Please provide your connecting flight to Koh Samui so we can time your pickup perfectly.",
      severity: "warning",
    };
  }

  // Guest has landed at final destination — ready for dispatch
  if (hasLanded && !isInTransit) {
    return {
      state: "arriving",
      operationallyReady: true,
      hasContextFlight,
      hasFinalFlight,
      isInTransit: false,
      staffLabel: `Landed${confirmedAirportLower ? ` (${confirmedAirportLower.toUpperCase()})` : ""}`,
      staffDetail: `Guest has arrived at their final destination. Driver can be dispatched.`,
      guestGuidance: "You've arrived! Your driver is on the way.",
      severity: "success",
    };
  }

  // Has international but no domestic — operational gap
  if (hasContextFlight && !hasFinalFlight) {
    return {
      state: "missing_final_flight",
      operationallyReady: false,
      hasContextFlight,
      hasFinalFlight: false,
      isInTransit: false,
      staffLabel: "Missing Final Flight",
      staffDetail: `International flight ${intlFlight} lands in Bangkok. Guest still needs a domestic flight to Koh Samui before pickup can be scheduled.`,
      guestGuidance: `Your international flight (${intlFlight}) arrives in Bangkok, not Koh Samui. Please book and share your connecting domestic flight so we can arrange your pickup at Samui airport.`,
      severity: "warning",
    };
  }

  // Final flight known, guest not departed yet — ready to schedule
  if (hasFinalFlight) {
    return {
      state: "awaiting_departure",
      operationallyReady: true,
      hasContextFlight,
      hasFinalFlight: true,
      isInTransit: false,
      staffLabel: "Awaiting Arrival",
      staffDetail: hasContextFlight
        ? `Route: ${intlFlight} → ${finalFlight}. Pickup timing based on ${finalFlight} arrival.`
        : `Direct flight ${finalFlight}. Pickup timing based on this flight.`,
      guestGuidance: hasContextFlight
        ? `Your pickup is based on your final flight ${finalFlight} to Koh Samui. Have a safe journey!`
        : `Your pickup is confirmed for flight ${finalFlight}. We'll be waiting for you!`,
      severity: "info",
    };
  }

  // No flights at all — early state
  return {
    state: "pre_departure",
    operationallyReady: false,
    hasContextFlight: false,
    hasFinalFlight: false,
    isInTransit: false,
    staffLabel: "No Flight Info",
    staffDetail: "No flight details have been provided. Pickup timing cannot be determined.",
    guestGuidance: "Please provide your flight details so we can arrange your airport pickup. If you're flying via Bangkok, we'll need your connecting flight to Koh Samui.",
    severity: "muted",
  };
}

/**
 * Should the system allow driver dispatch for this pickup?
 * Returns false when the guest is in transit or flight data is incomplete.
 */
export function canDispatchDriver(pickup: PickupData): boolean {
  const { operationallyReady } = getTravelState(pickup);
  return operationallyReady && pickup.status !== "completed" && pickup.status !== "cancelled";
}

/**
 * Get the operationally relevant flight number.
 * This is ALWAYS the final/domestic flight (flight_number).
 * Returns null if no final flight is set — meaning the system
 * cannot make operational decisions based on flight data.
 */
export function getOperationalFlight(pickup: PickupData): string | null {
  return pickup.flight_number ?? null;
}
