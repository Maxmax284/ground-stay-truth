/**
 * OG backfill worklist — the bookings that predate the platform's money trail.
 *
 * A booking imported from the old spreadsheet/WhatsApp era carries no payment
 * row, so the state machine correctly parks it in `pending_deposit` even after
 * the guest has physically arrived. Staff then reach for "Override expiry",
 * which only buys time — it does not record money or arrival.
 *
 * This module is the deterministic classifier behind the worklist: given a
 * booking and its recorded paid total, it says what the *next human action* is.
 * Pure functions only — no queries, no side effects — so the rules can be
 * tested and reused by the row-level quick actions.
 */

export type BackfillAction =
  | "record_payment" // stay started, nothing recorded, not marked pay-on-arrival
  | "mark_arrived" // money settled (or pay-on-arrival), body not logged
  | "check_in" // arrived + money reality handled, just needs the state flip
  | "none";

export interface BackfillCandidate {
  id: string;
  state: string;
  check_in: string;
  check_out: string;
  arrived_at?: string | null;
  pay_on_arrival?: boolean | null;
  total_price?: number | null;
  paid: number;
}

/** States that still owe a money or arrival decision. */
const OPEN_STATES = new Set([
  "inquiry",
  "soft_hold",
  "pending_approval",
  "pending_deposit",
  "confirmed",
]);

/** Stay has started (check-in date is today or earlier) in the given local day. */
export function stayHasStarted(checkIn: string, today: string): boolean {
  return String(checkIn).slice(0, 10) <= today;
}

/**
 * Is this booking part of the OG backfill worklist? Only stays that have
 * already begun and are still sitting in an open state qualify — a future
 * booking waiting on a deposit is normal business, not a backfill.
 */
export function isBackfillCandidate(b: BackfillCandidate, today: string): boolean {
  if (!OPEN_STATES.has(b.state)) return false;
  if (!stayHasStarted(b.check_in, today)) return false;
  if (String(b.check_out).slice(0, 10) < today) return true; // stay already ended, still open
  return true;
}

/** The single next action a staffer should take on this booking. */
export function nextBackfillAction(b: BackfillCandidate): BackfillAction {
  const moneyHandled = b.paid > 0 || b.pay_on_arrival === true;
  const arrived = Boolean(b.arrived_at);

  if (!moneyHandled) return "record_payment";
  if (!arrived) return "mark_arrived";
  if (b.state !== "checked_in") return "check_in";
  return "none";
}

export const BACKFILL_ACTION_LABELS: Record<BackfillAction, string> = {
  record_payment: "Record payment or flag pay-on-arrival",
  mark_arrived: "Mark guest as arrived",
  check_in: "Check the guest in",
  none: "Nothing outstanding",
};

/** Outstanding balance, floored at zero. */
export function outstandingFor(b: BackfillCandidate): number {
  return Math.max(0, Number(b.total_price ?? 0) - Number(b.paid ?? 0));
}
