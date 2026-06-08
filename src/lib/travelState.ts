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
  | "in_transit_bkk"       // Guest landed at a mainland transit node (BKK, DMK, URT) — final leg pending
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
 * Supports all arrival types: flight, ferry, bus, hybrid, unknown.
 */
export function getTravelState(pickup: PickupData): TravelStateInfo {
  const {
    status,
    flight_number: finalFlight,
    international_flight_number: intlFlight,
    confirmed_airport,
    guest_landed_at,
  } = pickup;

  const arrivalType = (pickup.arrival_type ?? "flight") as ArrivalType;
  const transportIntent = (pickup.transport_intent ?? "pickup") as TransportIntent;
  const pickupEnabled = pickup.pickup_enabled !== false;
  const locationName = pickup.arrival_location_name ?? null;
  const confidence = pickup.arrival_confidence ?? "high";

  const hasContextFlight = !!intlFlight;
  const hasFinalFlight = !!finalFlight;
  const confirmedAirportLower = confirmed_airport?.toLowerCase() ?? null;
  const hasLanded = !!guest_landed_at;
  // Mainland transit airports: BKK (Suvarnabhumi), DMK (Don Mueang), URT (Surat Thani).
  // None of these are the final Samui arrival — guest still needs a connecting flight or ferry.
  const MAINLAND_TRANSIT_AIRPORTS = new Set(["bkk", "dmk", "urt", "surat_thani", "suratthani"]);
  const isAtMainlandTransit = !!confirmedAirportLower && MAINLAND_TRANSIT_AIRPORTS.has(confirmedAirportLower);
  const isInTransit = hasLanded && isAtMainlandTransit && (arrivalType === "flight" || arrivalType === "hybrid");

  const pickupRes = resolvePickupStatus(transportIntent, pickupEnabled);
  const isNoPickup = pickupRes !== "pickup_scheduled";

  // ── Admin disabled pickup ──
  if (!pickupEnabled) {
    return {
      state: "pickup_disabled",
      operationallyReady: false,
      hasContextFlight,
      hasFinalFlight,
      isInTransit: false,
      staffLabel: "Pickup Disabled",
      staffDetail: "Admin has disabled pickup for this booking. Guest will self-arrive.",
      guestGuidance: "You'll be making your own way to us. Let us know if you need directions!",
      severity: "muted",
    };
  }

  // ── Self-arrival ──
  if (transportIntent === "self_arrival") {
    return {
      state: "self_arriving",
      operationallyReady: false,
      hasContextFlight,
      hasFinalFlight,
      isInTransit: false,
      staffLabel: "Self Arrival",
      staffDetail: `Guest is arriving on their own${locationName ? ` via ${locationName}` : ""}. No pickup required.`,
      guestGuidance: "You're making your own way to us — great! We'll be ready for you when you arrive.",
      severity: "info",
    };
  }

  // ── Terminal states ──
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

  // ── Non-flight arrival types (ferry, bus, hybrid, unknown) ──
  if (arrivalType !== "flight") {
    const typeLabel = arrivalType === "ferry" ? "Ferry" : arrivalType === "bus" ? "Bus" : arrivalType === "hybrid" ? "Multi-leg" : "Travel";
    const locLabel = locationName ?? (arrivalType === "ferry" ? "pier" : "arrival point");

    // Guest confirmed arrival
    if (hasLanded) {
      return {
        state: "arriving",
        operationallyReady: true,
        hasContextFlight: false,
        hasFinalFlight: false,
        isInTransit: false,
        staffLabel: `Arrived (${locLabel})`,
        staffDetail: `Guest has arrived at ${locLabel}. Driver can be dispatched.`,
        guestGuidance: "You've arrived! Your driver is on the way.",
        severity: "success",
      };
    }

    // Has arrival time
    if (pickup.arrival_datetime) {
      return {
        state: "awaiting_departure",
        operationallyReady: true,
        hasContextFlight: false,
        hasFinalFlight: false,
        isInTransit: false,
        staffLabel: `${typeLabel} — Awaiting Arrival`,
        staffDetail: `${typeLabel} arriving at ${locLabel}.${confidence === "flexible" ? " Timing is approximate." : ""}`,
        guestGuidance: `Your ${typeLabel.toLowerCase()} to Koh Samui is noted. ${confidence === "flexible" ? "Times can shift — we'll be flexible." : "We'll be ready for you!"}`,
        severity: "info",
      };
    }

    // No timing yet
    return {
      state: "pre_departure",
      operationallyReady: false,
      hasContextFlight: false,
      hasFinalFlight: false,
      isInTransit: false,
      staffLabel: `${typeLabel} — No Timing`,
      staffDetail: `Guest arriving by ${typeLabel.toLowerCase()} but no arrival time provided yet.`,
      guestGuidance: `Please let us know your approximate ${typeLabel.toLowerCase()} arrival time so we can arrange your pickup.`,
      severity: "muted",
    };
  }

  // ── Flight-based arrival logic (existing, preserved) ──

  // Guest is in transit at a mainland node (BKK / DMK / URT) — NOT ready for dispatch
  if (isInTransit) {
    const nodeLabel =
      confirmedAirportLower === "dmk" ? "DMK (Don Mueang)" :
      confirmedAirportLower === "urt" || confirmedAirportLower === "surat_thani" || confirmedAirportLower === "suratthani" ? "Surat Thani (URT)" :
      "Bangkok (BKK)";
    const nextLeg = confirmedAirportLower === "urt" || confirmedAirportLower === "surat_thani" || confirmedAirportLower === "suratthani"
      ? "ferry to Koh Samui"
      : "connecting flight to Koh Samui";
    return {
      state: "in_transit_bkk",
      operationallyReady: false,
      hasContextFlight,
      hasFinalFlight,
      isInTransit: true,
      staffLabel: `In Transit (${confirmedAirportLower?.toUpperCase()})`,
      staffDetail: hasFinalFlight
        ? `Guest landed at ${nodeLabel}. ${nextLeg.charAt(0).toUpperCase() + nextLeg.slice(1)} via ${finalFlight}. Do NOT dispatch driver yet.`
        : `Guest landed at ${nodeLabel}. Final ${nextLeg} not yet confirmed. Await onward leg details.`,
      guestGuidance: hasFinalFlight
        ? `You've landed at ${nodeLabel}! Your ${nextLeg} (${finalFlight}) is confirmed. Your driver will meet you when you arrive on Samui.`
        : `You've landed at ${nodeLabel}! Please share your ${nextLeg} details so we can time your pickup perfectly.`,
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
    staffLabel: "No Travel Info",
    staffDetail: "No travel details have been provided. Pickup timing cannot be determined.",
    guestGuidance: "Please let us know how you're getting to Koh Samui so we can arrange your pickup.",
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

// NOTE: upload_id is intentionally NOT in CRITICAL_KEYS. ID/passport upload is
// situational (only required for specific guests under specific circumstances)
// and must never block check-in. It remains a checklist item but is advisory only.
const CRITICAL_KEYS = [
  "connectivity_readiness",
  "confirm_domestic_flight",
  "tdac_completed",
  "confirm_arrival_time",
] as const;

const BLOCKER_LABELS: Record<string, string> = {
  connectivity_readiness: "No connectivity plan — guest may be unreachable after landing",
  confirm_domestic_flight: "Missing Samui flight — pickup timing unavailable",
  tdac_completed: "TDAC not completed — may delay immigration",
  upload_id: "ID / passport not on file (advisory — check-in not blocked)",
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
