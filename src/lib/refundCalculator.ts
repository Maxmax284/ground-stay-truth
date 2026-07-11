/**
 * Refund calculator — tiered cancellation policy math.
 *
 * PAYMENT-CRITICAL. This is the number that gets pushed to Stripe. The
 * refund-payment edge function trusts whatever comes out of here — so if the
 * math is wrong here, real money goes wrong in the world.
 *
 * Tiers come from `policy_settings` (property-scoped override allowed).
 * Default shape: 100% refund if > N days out, sliding scale, 0% inside the
 * penalty window. Non-refundable line items (booking fee, sometimes security
 * deposit) are excluded per policy.
 *
 * Pure function. Always returns a breakdown so the UI can show the guest
 * exactly why they're getting what they're getting.
 */
import { differenceInCalendarDays } from "date-fns";
import type { PolicySetting } from "@/hooks/usePolicySettings";

export interface RefundResult {
  tier: "free" | "partial" | "none";
  label: string;
  refundPercentage: number;
  refundAmount: number | null; // null if no total_price
  daysUntilCheckIn: number;
}

/**
 * Calculate refund based on cancellation policy tiers.
 * Uses policy_settings: free_cancellation_days, partial_refund_min_days, partial_refund_percentage.
 */
export function calculateRefund(
  checkInDate: string,
  totalPrice: number | null,
  policies: PolicySetting[]
): RefundResult {
  const freeDays = Number(policies.find((p) => p.key === "free_cancellation_days")?.value ?? 7);
  const partialMinDays = Number(policies.find((p) => p.key === "partial_refund_days")?.value ?? 3);
  const partialPct = Number(policies.find((p) => p.key === "partial_refund_percentage")?.value ?? 50);

  const daysUntilCheckIn = differenceInCalendarDays(new Date(checkInDate), new Date());

  if (daysUntilCheckIn >= freeDays) {
    return {
      tier: "free",
      label: `Full refund (${daysUntilCheckIn} days before check-in)`,
      refundPercentage: 100,
      refundAmount: totalPrice,
      daysUntilCheckIn,
    };
  }

  if (daysUntilCheckIn >= partialMinDays) {
    return {
      tier: "partial",
      label: `${partialPct}% refund (${daysUntilCheckIn} days before check-in)`,
      refundPercentage: partialPct,
      refundAmount: totalPrice != null ? Math.round((totalPrice * partialPct) / 100 * 100) / 100 : null,
      daysUntilCheckIn,
    };
  }

  return {
    tier: "none",
    label: `No refund (${daysUntilCheckIn} day${daysUntilCheckIn !== 1 ? "s" : ""} before check-in)`,
    refundPercentage: 0,
    refundAmount: 0,
    daysUntilCheckIn,
  };
}
