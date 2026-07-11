/**
 * Deposit policy resolver.
 *
 * Bookings have TWO independent money buckets that people conflate all the
 * time — keep them straight:
 *
 *   - Deposit           = portion of stay total (default 20%). Applied to the
 *                         balance. Required to confirm a booking.
 *   - Security deposit  = separate refundable hold against damages. Optional,
 *                         controlled by `security_deposit_required` policy.
 *   - Booking fee       = platform/processing fee. Optional, `booking_fee_*`
 *                         policies. Non-refundable by default.
 *
 * All three are created as `pending` `payments` rows by DB triggers when a
 * booking enters a hold state. This module just resolves "what does the
 * policy say" for the UI.
 */
import type { PolicySetting } from "@/hooks/usePolicySettings";

export type DepositMode = "manual_only" | "online_optional" | "online_required";

export interface DepositPolicy {
  onlineEnabled: boolean;
  manualEnabled: boolean;
  requireOnline: boolean;
  effectiveMode: DepositMode;
}

/**
 * Compute the effective deposit policy from the policy_settings rows.
 * This is the single source of truth — no component should hardcode deposit logic.
 */
export function getDepositPolicy(policies: PolicySetting[] | undefined | null): DepositPolicy {
  const get = (key: string) => policies?.find((p) => p.key === key);

  const onlineEnabled = String(get("deposits_online_enabled")?.value) === "true";
  const manualEnabled = String(get("deposits_manual_enabled")?.value) !== "false"; // default true
  const requireOnline = String(get("deposits_require_online_when_enabled")?.value) === "true";

  let effectiveMode: DepositMode = "manual_only";
  if (onlineEnabled && requireOnline) {
    effectiveMode = "online_required";
  } else if (onlineEnabled) {
    effectiveMode = "online_optional";
  }

  return { onlineEnabled, manualEnabled, requireOnline, effectiveMode };
}
