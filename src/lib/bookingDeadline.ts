/**
 * BUSINESS-CRITICAL — Booking hold / deposit deadline resolution.
 *
 * A booking in `soft_hold` or `pending_deposit` has a clock on it. By default
 * that clock is derived from policy hours (soft_hold_expiration_hours /
 * deposit_deadline_hours) counted from the booking's created_at / updated_at.
 *
 * Staff can override that clock by writing an explicit `hold_deadline_at`
 * on the booking. When present, the override wins — this is how an expired
 * booking gets put back in play without faking timestamps.
 */

export type DeadlineSource = "policy" | "override";

export interface BookingDeadlineInfo {
  /** Absolute moment the hold / deposit window closes. */
  deadline: Date;
  isExpired: boolean;
  /** Whole hours left (can be negative when expired). */
  hoursRemaining: number;
  /** How many hours past the deadline we are (0 when not expired). */
  hoursOverdue: number;
  source: DeadlineSource;
  /** Policy window in hours (for display / defaults). */
  policyHours: number;
}

type PolicyRow = { key: string; value: any };

function policyHours(policies: PolicyRow[] | undefined, key: string, fallback: number) {
  const row = policies?.find((p) => p.key === key);
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Returns deadline info for a booking, or null when the booking's state has
 * no clock attached (confirmed, checked_in, cancelled, ...).
 */
export function getBookingDeadline(
  booking: any | null | undefined,
  policies: PolicyRow[] | undefined,
  now: Date = new Date(),
): BookingDeadlineInfo | null {
  if (!booking) return null;
  const state = booking.state as string;

  let hours: number;
  let anchor: Date;
  if (state === "soft_hold") {
    hours = policyHours(policies, "soft_hold_expiration_hours", 12);
    anchor = new Date(booking.created_at);
  } else if (state === "pending_deposit") {
    hours = policyHours(policies, "deposit_deadline_hours", 24);
    anchor = new Date(booking.updated_at ?? booking.created_at);
  } else {
    return null;
  }

  const override = booking.hold_deadline_at ? new Date(booking.hold_deadline_at) : null;
  const deadline = override ?? new Date(anchor.getTime() + hours * 3600_000);
  const diffMs = deadline.getTime() - now.getTime();

  return {
    deadline,
    isExpired: diffMs <= 0,
    hoursRemaining: Math.floor(diffMs / 3600_000),
    hoursOverdue: diffMs <= 0 ? Math.floor(-diffMs / 3600_000) : 0,
    source: override ? "override" : "policy",
    policyHours: hours,
  };
}

/** Convenience: is this booking sitting past its clock right now? */
export function isBookingExpired(booking: any, policies: PolicyRow[] | undefined, now?: Date) {
  return getBookingDeadline(booking, policies, now)?.isExpired ?? false;
}

/** Plain-English countdown, e.g. "3h left" / "2h overdue" / "just expired". */
export function describeDeadline(info: BookingDeadlineInfo): string {
  if (!info.isExpired) {
    return info.hoursRemaining >= 1 ? `${info.hoursRemaining}h left` : "under 1h left";
  }
  return info.hoursOverdue >= 1 ? `${info.hoursOverdue}h overdue` : "just expired";
}
