// -----------------------------------------------------------------------------
// Availability result model — used by useAutoAssignUnit and the booking form.
//
// The goal is that the UI never has to guess *why* an availability check
// failed. Every possible outcome maps to exactly one status here, and the
// UI has a fixed message per status. See failure-mode map in
// GuestBookingRequestForm / useAutoAssignUnit for the classification rules.
// -----------------------------------------------------------------------------

export type AvailabilityStatus =
  | "available"           // check ran, at least one unit free
  | "unavailable"         // check ran, zero units free (real inventory conflict)
  | "pricing_unavailable" // check ran, but no valid pricing covers the dates
  | "network_error"       // couldn't reach the backend at all (offline / CORS / DNS)
  | "server_error"        // backend reached but returned 5xx / auth failure / thrown error
  | "configuration_error" // group has zero active units, or malformed inventory
  | "unknown_error";      // response arrived but shape was unrecognized

export interface AvailabilityResult {
  status: AvailabilityStatus;
  unit_id?: string;
  unit_name?: string;
  available_count: number;
  total_count: number;
  /** Which layer produced the final answer. */
  source: "edge_function" | "rpc_fallback" | "client";
  /** True if the edge function failed and we fell back to the RPC. */
  fallback_attempted: boolean;
  fallback_succeeded: boolean;
  /** Developer-facing detail. Never surfaced to guests. */
  debug?: string;
}

/**
 * Statuses the guest can retry from a transient failure.
 * Genuine `unavailable` should NOT show a retry button — the guest must
 * change dates.
 */
export const RETRYABLE_STATUSES: AvailabilityStatus[] = [
  "network_error",
  "server_error",
  "unknown_error",
];

/**
 * Guest-safe copy per status. Plain English, no jargon, no stack traces.
 */
export const GUEST_MESSAGES: Record<AvailabilityStatus, string> = {
  available: "",
  unavailable: "No rooms are available for these dates.",
  pricing_unavailable:
    "Pricing for these dates is currently unavailable. Please try different dates or contact us.",
  network_error:
    "We couldn't check availability right now. Please try again.",
  server_error:
    "Something went wrong while checking availability. Please try again.",
  configuration_error:
    "This room type isn't set up for online booking yet. Please contact us.",
  unknown_error:
    "Something went wrong while checking availability. Please try again.",
};

export interface AvailabilityLogContext {
  group_id?: string;
  check_in?: string;
  check_out?: string;
  status: AvailabilityStatus;
  source: AvailabilityResult["source"];
  fallback_attempted: boolean;
  fallback_succeeded: boolean;
  debug?: string;
}

/**
 * Structured console log — picked up by Lovable's log tailing and by
 * anyone tailing the browser console. Not sent to the DB (would be noisy).
 * If we ever want persistent tracking, wire this to staff_audit_events via
 * a fire-and-forget edge call — but only for non-`available` statuses.
 */
export function logAvailability(ctx: AvailabilityLogContext) {
  const fn = ctx.status === "available" || ctx.status === "unavailable"
    ? console.debug
    : console.warn;
  fn("[availability]", JSON.stringify(ctx));
}
