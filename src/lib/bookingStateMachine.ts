import type { Database } from "@/integrations/supabase/types";

export type BookingState = Database["public"]["Enums"]["booking_state"];

/**
 * Canonical state transition map for LMT CampStay.
 * Only transitions listed here are valid without an admin override.
 */
export const STATE_TRANSITIONS: Record<BookingState, BookingState[]> = {
  // Streamlined flow: inquiry → pending_deposit → confirmed
  // soft_hold and pending_approval remain valid states (legacy + admin override only)
  // Walk-ins who already paid at the desk can go inquiry → confirmed directly;
  // the pending_deposit step exists for money that hasn't landed yet.
  inquiry: ["pending_deposit", "confirmed", "cancelled"],

  soft_hold: ["pending_deposit", "cancelled"],
  pending_approval: ["pending_deposit", "cancelled"],
  pending_deposit: ["confirmed", "cancelled"],
  // `confirmed → completed` covers stays where nobody pressed check-in
  // (manual/legacy bookings, or the guest left before staff got to it).
  confirmed: ["checked_in", "completed", "cancelled", "no_show"],
  checked_in: ["completed"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export const STATE_LABELS: Record<BookingState, string> = {
  inquiry: "Inquiry",
  soft_hold: "Soft Hold",
  pending_approval: "Pending Approval",
  pending_deposit: "Pending Deposit",
  confirmed: "Confirmed",
  checked_in: "Checked In",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-Show",
};

/**
 * States that block calendar dates (overlap protection).
 *
 * Single source of truth — every surface that asks "is this room held?" must
 * use this list: the DB `check_booking_overlap()` trigger, the
 * `auto-assign-unit` / `get-availability` edge functions, and the booking
 * form's local pre-check. `inquiry` is included so an unacknowledged inquiry
 * soft-holds the dates instead of silently allowing a second booking on top
 * of it.
 */
export const BLOCKING_STATES: BookingState[] = [
  "inquiry",
  "soft_hold",
  "pending_approval",
  "pending_deposit",
  "confirmed",
  "checked_in",
];

/** States considered "active" for dashboard counts */
export const ACTIVE_STATES: BookingState[] = [
  "inquiry",
  "soft_hold",
  "pending_approval",
  "pending_deposit",
  "confirmed",
  "checked_in",
];

/** Badge color variant per state — maps to design system tokens */
export const STATE_VARIANTS: Record<BookingState, string> = {
  inquiry: "bg-muted text-muted-foreground",
  soft_hold: "bg-accent text-accent-foreground",
  pending_approval: "bg-warning/20 text-warning-foreground",
  pending_deposit: "bg-warning/20 text-warning-foreground",
  confirmed: "bg-success/20 text-[hsl(var(--success))]",
  checked_in: "bg-info/20 text-[hsl(var(--info))]",
  completed: "bg-secondary text-secondary-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-destructive/10 text-destructive",
};

export function getValidTransitions(currentState: BookingState): BookingState[] {
  return STATE_TRANSITIONS[currentState] ?? [];
}

/** For admin override: all states except the current one */
export function getAllTransitions(currentState: BookingState): BookingState[] {
  const allStates: BookingState[] = [
    "inquiry", "soft_hold", "pending_approval", "pending_deposit",
    "confirmed", "checked_in", "completed", "cancelled", "no_show",
  ];
  return allStates.filter((s) => s !== currentState);
}
