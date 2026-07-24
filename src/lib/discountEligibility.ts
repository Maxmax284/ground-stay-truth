/**
 * Single source of truth for "can this booking still receive a discount /
 * adjustment?" Mirrors server-side rules in apply-booking-adjustment:
 *   - No recorded/succeeded payment.
 *   - Booking must not be terminal (cancelled / completed / no_show).
 * Any UI that surfaces a "%" or "Apply discount" button should call this
 * so the tooltip copy stays consistent everywhere.
 */

export type DiscountEligibility =
  | { allowed: true; reason: null }
  | { allowed: false; reason: string };

const TERMINAL_STATES = new Set(["cancelled", "completed", "no_show"]);
const PAID_STATUSES = new Set([
  "recorded",
  "succeeded",
  "captured",
  "completed",
]);

export function getDiscountEligibility(
  bookingState: string | null | undefined,
  payments: Array<{ status?: string | null }> | null | undefined,
): DiscountEligibility {
  if (bookingState && TERMINAL_STATES.has(bookingState)) {
    return {
      allowed: false,
      reason: `Locked — booking is ${bookingState.replace("_", " ")}`,
    };
  }
  const paid = (payments ?? []).some((p) =>
    PAID_STATUSES.has(String(p?.status ?? ""))
  );
  if (paid) {
    return {
      allowed: false,
      reason: "Locked — payment already recorded. Use the refund workflow instead.",
    };
  }
  return { allowed: true, reason: null };
}

export const DISCOUNT_TOOLTIP_HELP =
  "Apply a discretionary discount before any payment is recorded. Once a deposit hits, this locks and you must use the refund flow.";
