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
