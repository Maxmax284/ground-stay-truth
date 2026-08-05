/**
 * Unified Arrival Model
 *
 * The system only cares about THREE things:
 * 1. Final arrival location on Koh Samui
 * 2. Final arrival time
 * 3. Whether staff action is required
 *
 * Everything else (flight numbers, ferry routes, bus schedules) is secondary context.
 */

// ── Arrival Types ────────────────────────────────────────────────────────────

export const ARRIVAL_TYPES = ["flight", "ferry", "bus", "hybrid", "unknown"] as const;
export type ArrivalType = (typeof ARRIVAL_TYPES)[number];

export const ARRIVAL_LOCATION_TYPES = ["airport", "pier", "other"] as const;
export type ArrivalLocationType = (typeof ARRIVAL_LOCATION_TYPES)[number];

export const ARRIVAL_CONFIDENCE_LEVELS = ["high", "flexible", "unknown"] as const;
export type ArrivalConfidence = (typeof ARRIVAL_CONFIDENCE_LEVELS)[number];

export const TRANSPORT_INTENTS = ["pickup", "self_arrival"] as const;
export type TransportIntent = (typeof TRANSPORT_INTENTS)[number];

// ── Location Registry ────────────────────────────────────────────────────────

export interface ArrivalLocation {
  type: ArrivalLocationType;
  name: string;
  shortName: string;
  /** Default for this arrival type */
  defaultFor?: ArrivalType;
}

export const SAMUI_LOCATIONS: ArrivalLocation[] = [
  { type: "airport", name: "Samui Airport (USM)", shortName: "USM", defaultFor: "flight" },
  { type: "pier", name: "Nathon Pier", shortName: "Nathon", defaultFor: "ferry" },
  { type: "pier", name: "Lipa Noi Pier", shortName: "Lipa Noi" },
  { type: "other", name: "Other / Not sure yet", shortName: "Other" },
];

export function getDefaultLocation(arrivalType: ArrivalType): ArrivalLocation {
  return (
    SAMUI_LOCATIONS.find((l) => l.defaultFor === arrivalType) ??
    SAMUI_LOCATIONS[SAMUI_LOCATIONS.length - 1]
  );
}

export function getLocationByName(name: string | null | undefined): ArrivalLocation | null {
  if (!name) return null;
  return SAMUI_LOCATIONS.find(
    (l) => l.name === name || l.shortName.toLowerCase() === name.toLowerCase()
  ) ?? null;
}

// ── Arrival Type Metadata ────────────────────────────────────────────────────

export interface ArrivalTypeConfig {
  label: string;
  icon: string; // lucide icon name
  defaultConfidence: ArrivalConfidence;
  defaultLocationType: ArrivalLocationType;
  /** Whether exact timing is expected */
  precisionExpected: boolean;
  /** Guidance tone for guest */
  toneSuffix: string;
}

export const ARRIVAL_TYPE_CONFIG: Record<ArrivalType, ArrivalTypeConfig> = {
  flight: {
    label: "Flight",
    icon: "Plane",
    defaultConfidence: "high",
    defaultLocationType: "airport",
    precisionExpected: true,
    toneSuffix: "We'll track your flight and have your driver ready.",
  },
  ferry: {
    label: "Ferry",
    icon: "Ship",
    defaultConfidence: "flexible",
    defaultLocationType: "pier",
    precisionExpected: false,
    toneSuffix: "Ferry times can shift — no worries, we'll be flexible with your pickup.",
  },
  bus: {
    label: "Bus",
    icon: "Bus",
    defaultConfidence: "flexible",
    defaultLocationType: "other",
    precisionExpected: false,
    toneSuffix: "Just let us know your approximate arrival and we'll coordinate from there.",
  },
  hybrid: {
    label: "Multi-leg",
    icon: "Route",
    defaultConfidence: "flexible",
    defaultLocationType: "airport",
    precisionExpected: false,
    toneSuffix: "We'll focus on your final arrival to Koh Samui — the rest is just context.",
  },
  unknown: {
    label: "Not specified",
    icon: "HelpCircle",
    defaultConfidence: "unknown",
    defaultLocationType: "other",
    precisionExpected: false,
    toneSuffix: "Let us know how you're getting here when you're ready.",
  },
};

// ── Pickup Resolution ────────────────────────────────────────────────────────

export type PickupResolution =
  | "pickup_requested"
  | "pickup_scheduled"
  | "pickup_completed"
  | "pickup_failed"
  | "self_arrival"
  | "pickup_disabled";

/**
 * Resolve the final pickup status.
 * Admin override (pickup_enabled) ALWAYS wins.
 *
 * "Pickup Scheduled" is an operational promise — it requires a driver AND a
 * verified arrival time. A bare guest request stays "Pickup Requested".
 */
export function resolvePickupStatus(
  transportIntent: TransportIntent,
  pickupEnabled: boolean,
  scheduled: boolean = true,
  status?: string | null,
): PickupResolution {
  if (!pickupEnabled) return "pickup_disabled";
  if (transportIntent === "self_arrival") return "self_arrival";
  if (status === "completed") return "pickup_completed";
  if (status === "failed") return "pickup_failed";
  return scheduled ? "pickup_scheduled" : "pickup_requested";
}

/** Any resolution where a pickup is still an operational obligation. */
export function isActivePickup(resolution: PickupResolution): boolean {
  return resolution === "pickup_requested" || resolution === "pickup_scheduled";
}

export const PICKUP_RESOLUTION_LABELS: Record<PickupResolution, { label: string; color: string }> = {
  pickup_requested: { label: "Pickup Requested", color: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" },
  pickup_scheduled: { label: "Pickup Scheduled", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  pickup_completed: { label: "Pickup Completed", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  pickup_failed: { label: "Pickup Not Completed", color: "bg-destructive/15 text-destructive" },
  self_arrival: { label: "Self Arrival", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  pickup_disabled: { label: "Pickup Disabled by Admin", color: "bg-muted text-muted-foreground" },
};

// ── Normalized Arrival Data ──────────────────────────────────────────────────

export interface NormalizedArrival {
  arrivalType: ArrivalType;
  locationType: ArrivalLocationType;
  locationName: string | null;
  arrivalTime: string | null;
  confidence: ArrivalConfidence;
  transportIntent: TransportIntent;
  pickupEnabled: boolean;
  /** Resolved pickup status */
  pickupResolution: PickupResolution;
  /** Whether staff needs to act on this arrival */
  requiresStaffAction: boolean;
}

/**
 * Normalize raw pickup data into the unified arrival model.
 * This is the single adapter between DB shape and arrival logic.
 */
export function normalizeArrival(pickup: {
  arrival_type?: string;
  arrival_location_type?: string;
  arrival_location_name?: string | null;
  arrival_datetime?: string | null;
  arrival_confidence?: string;
  transport_intent?: string;
  pickup_enabled?: boolean;
  status?: string;
  driver_id?: string | null;
  confirmed_at?: string | null;
}): NormalizedArrival {
  const arrivalType = (ARRIVAL_TYPES.includes(pickup.arrival_type as ArrivalType)
    ? pickup.arrival_type
    : "flight") as ArrivalType;

  const locationType = (ARRIVAL_LOCATION_TYPES.includes(pickup.arrival_location_type as ArrivalLocationType)
    ? pickup.arrival_location_type
    : ARRIVAL_TYPE_CONFIG[arrivalType].defaultLocationType) as ArrivalLocationType;

  const confidence = (ARRIVAL_CONFIDENCE_LEVELS.includes(pickup.arrival_confidence as ArrivalConfidence)
    ? pickup.arrival_confidence
    : ARRIVAL_TYPE_CONFIG[arrivalType].defaultConfidence) as ArrivalConfidence;

  const transportIntent = (TRANSPORT_INTENTS.includes(pickup.transport_intent as TransportIntent)
    ? pickup.transport_intent
    : "pickup") as TransportIntent;

  const pickupEnabled = pickup.pickup_enabled !== false;

  // A pickup only counts as "scheduled" once a driver is attached and a
  // concrete arrival time exists (or staff explicitly confirmed it).
  const driverAssigned = !!pickup.driver_id;
  const hasArrivalTime = !!pickup.arrival_datetime;
  const staffConfirmed = !!pickup.confirmed_at ||
    ["assigned", "confirmed", "in_progress", "completed"].includes(pickup.status ?? "");
  // Legacy rows carry neither driver nor confirmation info in the payload —
  // when the caller passes no driver field at all, fall back to status only.
  const driverFieldProvided = "driver_id" in pickup;
  const scheduled = driverFieldProvided
    ? driverAssigned && hasArrivalTime && staffConfirmed
    : staffConfirmed;

  const resolution = resolvePickupStatus(transportIntent, pickupEnabled, scheduled, pickup.status);

  return {
    arrivalType,
    locationType,
    locationName: pickup.arrival_location_name ?? null,
    arrivalTime: pickup.arrival_datetime ?? null,
    confidence,
    transportIntent,
    pickupEnabled,
    pickupResolution: resolution,
    driverAssigned,
    requiresStaffAction: isActivePickup(resolution),
  };
}

// ── Operational warnings ─────────────────────────────────────────────────────

export interface PickupWarning {
  severity: "warning" | "critical";
  message: string;
}

/**
 * Driver-assignment and arrival-reconciliation warnings.
 * Escalates as the arrival gets closer, and after it has passed.
 */
export function getPickupWarnings(
  arrival: NormalizedArrival,
  opts: { now?: Date; guestOnSite?: boolean } = {},
): PickupWarning[] {
  const out: PickupWarning[] = [];
  if (!isActivePickup(arrival.pickupResolution)) return out;

  const now = opts.now ?? new Date();
  const at = arrival.arrivalTime ? new Date(arrival.arrivalTime) : null;
  const hoursOut = at ? (at.getTime() - now.getTime()) / 3_600_000 : null;

  if (!at) {
    out.push({ severity: "warning", message: "No arrival time on file — confirm the flight or transfer details." });
  }

  if (!arrival.driverAssigned) {
    if (hoursOut !== null && hoursOut <= 3) {
      out.push({
        severity: "critical",
        message: hoursOut < 0
          ? "Arrival time has passed and no driver was ever assigned. This pickup did not happen — record the outcome."
          : "Arrival is within 3 hours and no driver has accepted. Assign and notify a driver now.",
      });
    } else if (hoursOut !== null && hoursOut <= 24) {
      out.push({ severity: "warning", message: "Arrival is within 24 hours and no driver is assigned yet." });
    } else {
      out.push({ severity: "warning", message: "Pickup requested — no driver assigned yet." });
    }
  }

  if (hoursOut !== null && hoursOut < 0 && !opts.guestOnSite) {
    out.push({
      severity: "warning",
      message: "Arrival time has passed. Confirm whether the guest has arrived, is delayed, or is a no-show.",
    });
  }

  return out;
}
