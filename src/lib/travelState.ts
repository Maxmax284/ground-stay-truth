/**
 * Travel State Awareness Layer
 * 
 * Centralizes the logic for interpreting a guest's current position
 * in their journey. Supports all arrival types: flight, ferry, bus, hybrid.
 * 
 * For flights: recognizes multi-leg journeys (BKK → USM).
 * For ferry/bus/hybrid: uses flexible timing with arrival_confidence.
 * 
 * Field semantics (existing schema, unchanged):
 *   - international_flight_number: first leg (context only, not operational)
 *   - flight_number: final/domestic leg (drives pickup timing & dispatch)
 *   - final_flight_confirmed: whether the operational flight is locked in
 *   - confirmed_airport: where the guest said they landed
 *   - guest_landed_at: timestamp of "I've Landed" / "I've Arrived" confirmation
 *   - arrival_type: flight | ferry | bus | hybrid | unknown
 *   - arrival_location_type: airport | pier | other
 *   - transport_intent: pickup | self_arrival
 *   - pickup_enabled: admin override (false = no pickup regardless)
 * 
 * The ONLY flight that drives operational decisions (driver dispatch,
 * arrival readiness, pickup timing) is flight_number — the final leg.
 * international_flight_number exists purely for staff context.
 */
import { type ArrivalType, type TransportIntent, resolvePickupStatus } from "@/lib/arrivalModel";

export type TravelState =
  | "pre_departure"        // No landing, no transit — guest hasn't left yet
  | "missing_final_flight" // Has international flight but no domestic — can't schedule pickup
  | "awaiting_departure"   // Final flight known, guest hasn't landed yet
  | "in_transit_bkk"       // Guest landed in BKK, connecting flight expected
  | "arriving"             // Guest confirmed landing at final destination
  | "arrived"              // Pickup completed
  | "cancelled"            // Pickup cancelled
  | "self_arriving"        // Guest is self-arriving (no pickup needed)
  | "pickup_disabled";     // Admin disabled pickup

export type AssistMode = "healthy" | "degraded" | "manual_assist" | "recovery_pending";

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

/**
 * Determine the assist mode for a pickup based on system confidence signals.
 * This answers "how much do we trust the system right now?" — separate from
 * the travel state which answers "where is the guest?"
 */
export interface AssistSignals {
  /** Current assist_mode stored on the pickup */
  currentMode: AssistMode;
  /** Flight tracking last_checked_at timestamp */
  flightLastChecked: string | null;
  /** Flight tracking status */
  flightStatus: string | null;
  /** Whether flight API returned an error on last check */
  flightApiError: boolean;
  /** Whether guest-reported airport mismatches flight data */
  locationMismatch: boolean;
  /** Whether translation failed recently */
  translationFailed: boolean;
  /** Staleness threshold in minutes */
  stalenessThresholdMinutes?: number;
  /** Pre-arrival checklist critical items missing (keys) */
  checklistCriticalMissing?: string[];
  /** Whether guest confirmed connectivity readiness */
  connectivityConfirmed?: boolean;
}

export interface AssistModeResult {
  mode: AssistMode;
  reason: string | null;
  shouldEscalate: boolean;
}

/**
 * Evaluate system confidence and return recommended assist mode.
 * Does NOT write to DB — caller decides whether to apply.
 */
export function evaluateAssistMode(signals: AssistSignals): AssistModeResult {
  const threshold = signals.stalenessThresholdMinutes ?? 30;

  // If already in manual_assist or recovery_pending, don't auto-change
  if (signals.currentMode === "manual_assist" || signals.currentMode === "recovery_pending") {
    return { mode: signals.currentMode, reason: null, shouldEscalate: false };
  }

  // Hard triggers → manual_assist
  if (signals.locationMismatch) {
    return {
      mode: "manual_assist",
      reason: "Guest said they landed, but current flight data still shows a different airport.",
      shouldEscalate: true,
    };
  }

  // Soft triggers → degraded
  const degradedReasons: string[] = [];

  if (signals.flightApiError) {
    degradedReasons.push("Flight updates are delayed right now.");
  }

  if (signals.flightLastChecked) {
    const minutesSince = (Date.now() - new Date(signals.flightLastChecked).getTime()) / 60000;
    if (minutesSince > threshold) {
      degradedReasons.push(`Flight data is ${Math.round(minutesSince)} minutes old.`);
    }
  }

  if (signals.flightStatus === "not_found") {
    degradedReasons.push("Flight number not found in tracking system.");
  }

  if (signals.translationFailed) {
    degradedReasons.push("Translation service is temporarily unavailable.");
  }

  // Checklist-driven confidence signals
  const criticalMissing = signals.checklistCriticalMissing ?? [];
  if (criticalMissing.length > 0) {
    // Missing connectivity is especially impactful
    if (criticalMissing.includes("connectivity_readiness")) {
      degradedReasons.push("Guest has not confirmed internet access for arrival — communication may fail.");
    }
    // Missing domestic flight via checklist (redundant with flight data but earlier signal)
    if (criticalMissing.includes("confirm_domestic_flight")) {
      degradedReasons.push("Guest has not confirmed their Samui flight — pickup timing unavailable.");
    }
    // Missing TDAC
    if (criticalMissing.includes("tdac_completed")) {
      degradedReasons.push("Thailand arrival card not completed — may delay immigration.");
    }
  }

  if (degradedReasons.length > 0) {
    // If multiple degraded signals, escalate to manual_assist
    if (degradedReasons.length >= 3) {
      return {
        mode: "manual_assist",
        reason: degradedReasons.join(" "),
        shouldEscalate: true,
      };
    }
    return {
      mode: "degraded",
      reason: degradedReasons.join(" "),
      shouldEscalate: false,
    };
  }

  return { mode: "healthy", reason: null, shouldEscalate: false };
}

/**
 * Check if system has recovered from a degraded/manual state.
 * Returns true if all signals are healthy again.
 */
export function isSystemHealthy(signals: AssistSignals): boolean {
  const threshold = signals.stalenessThresholdMinutes ?? 30;
  if (signals.flightApiError || signals.locationMismatch || signals.translationFailed) return false;
  if (signals.flightStatus === "not_found") return false;
  if (signals.flightLastChecked) {
    const minutesSince = (Date.now() - new Date(signals.flightLastChecked).getTime()) / 60000;
    if (minutesSince > threshold) return false;
  }
  return true;
}

export interface PickupData {
  status: string;
  flight_number: string | null;
  international_flight_number: string | null;
  final_flight_confirmed: boolean;
  confirmed_airport: string | null;
  guest_landed_at: string | null;
  arrival_datetime: string | null;
  // Unified arrival model fields
  arrival_type?: string;
  arrival_location_type?: string;
  arrival_location_name?: string | null;
  arrival_confidence?: string;
  transport_intent?: string;
  pickup_enabled?: boolean;
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

// ─── ARRIVAL READINESS ────────────────────────────────────────────────────────

export interface ArrivalReadiness {
  /** All critical checklist items are complete */
  ready: boolean;
  /** 0-100 across ALL items */
  score: number;
  /** Human-readable blockers */
  blockers: string[];
  /** item_key values of missing critical items */
  missingCritical: string[];
  /** Critical items completed vs total */
  criticalCompleted: number;
  criticalTotal: number;
}

const CRITICAL_KEYS = [
  "connectivity_readiness",
  "confirm_domestic_flight",
  "tdac_completed",
  "upload_id",
  "confirm_arrival_time",
] as const;

const BLOCKER_LABELS: Record<string, string> = {
  connectivity_readiness: "No connectivity plan — guest may be unreachable after landing",
  confirm_domestic_flight: "Missing Samui flight — pickup timing unavailable",
  tdac_completed: "TDAC not completed — may delay immigration",
  upload_id: "ID / passport not uploaded — check-in blocked",
  confirm_arrival_time: "Arrival time not confirmed",
};

/**
 * Compute arrival readiness from checklist items + pickup data.
 * Cross-references pickup so that if a domestic flight already exists
 * on the pickup record, `confirm_domestic_flight` is not a blocker.
 */
export function getArrivalReadiness(
  checklistItems: { item_key: string; completed: boolean }[],
  allItemCount: number,
  pickup: PickupData | null,
): ArrivalReadiness {
  const completedKeys = new Set(
    checklistItems.filter((i) => i.completed).map((i) => i.item_key),
  );

  const missingCritical: string[] = [];
  for (const key of CRITICAL_KEYS) {
    if (completedKeys.has(key)) continue;
    // Cross-reference: if pickup already has the domestic flight, skip this blocker
    if (key === "confirm_domestic_flight" && pickup?.flight_number) continue;
    missingCritical.push(key);
  }

  const blockers = missingCritical.map(
    (key) => BLOCKER_LABELS[key] ?? key,
  );

  const completedCount = checklistItems.filter((i) => i.completed).length;
  const score = allItemCount > 0 ? Math.round((completedCount / allItemCount) * 100) : 0;

  return {
    ready: missingCritical.length === 0,
    score,
    blockers,
    missingCritical,
    criticalCompleted: CRITICAL_KEYS.length - missingCritical.length,
    criticalTotal: CRITICAL_KEYS.length,
  };
}
