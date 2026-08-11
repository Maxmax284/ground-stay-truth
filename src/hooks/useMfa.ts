/**
 * MFA hook: policy + enrollment + step-up challenge.
 * Wraps Supabase Auth MFA (TOTP) APIs and exposes helpers for the
 * Security Center, staff enrollment UI, and the StepUpDialog.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import type { AppRole } from "@/lib/permissions";
import {
  DEFAULT_TRUST_WINDOW_HOURS,
  clampTrustWindowHours,
  clearMfaTrust,
  isDeviceTrusted,
  markMfaVerified,
  trustExpiresAt,
} from "@/lib/mfaTrust";

export interface MfaPolicy {
  /** Always true — admin-level MFA cannot be switched off. */
  requiredForAdmin: boolean;
  requiredForManager: boolean;
  requiredForStaff: boolean;
  gracePeriodDays: number;
  requireForSensitiveActions: boolean;
  /** Hours a device stays trusted before another 6-digit code is asked for. */
  trustWindowHours: number;
}

const DEFAULT_POLICY: MfaPolicy = {
  requiredForAdmin: true,
  requiredForManager: false,
  requiredForStaff: false,
  gracePeriodDays: 7,
  requireForSensitiveActions: true,
  trustWindowHours: DEFAULT_TRUST_WINDOW_HOURS,
};

/** Roles that always require MFA, no matter what the policy rows say. */
export const MFA_MANDATORY_ROLES: AppRole[] = ["admin"];

function readBool(map: Map<string, unknown>, key: string, fallback: boolean): boolean {
  const raw = map.get(key);
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw === "boolean") return raw;
  const s = String(raw).replace(/^"|"$/g, "").toLowerCase();
  return s === "true";
}

function readNum(map: Map<string, unknown>, key: string, fallback: number): number {
  const raw = map.get(key);
  if (raw === undefined || raw === null) return fallback;
  const n = Number(String(raw).replace(/^"|"$/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

export function useMfaPolicy(): MfaPolicy {
  const { data: policies } = usePolicySettings();
  return useMemo(() => {
    if (!policies) return DEFAULT_POLICY;
    const map = new Map(policies.map((p: any) => [p.key, p.value]));
    return {
      // Hard-locked on: high-privilege access always needs a second factor.
      requiredForAdmin: true,
      requiredForManager: readBool(map, "mfa_required_manager", false),
      requiredForStaff: readBool(map, "mfa_required_staff", false),
      gracePeriodDays: readNum(map, "mfa_grace_period_days", 7),
      requireForSensitiveActions: readBool(map, "mfa_required_sensitive_actions", true),
      trustWindowHours: clampTrustWindowHours(
        readNum(map, "mfa_trust_window_hours", DEFAULT_TRUST_WINDOW_HOURS)
      ),
    };
  }, [policies]);
}

export function mfaRequiredForRole(role: AppRole | null, policy: MfaPolicy): boolean {
  if (!role) return false;
  if (MFA_MANDATORY_ROLES.includes(role)) return true;
  if (role === "manager") return policy.requiredForManager;
  if (role === "guest") return false;
  return policy.requiredForStaff;
}

export interface MfaStatus {
  enrolled: boolean;
  verified: boolean;
  factorId: string | null;
  factors: Array<{ id: string; status: string; friendly_name?: string | null }>;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useMfaStatus(): MfaStatus {
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<MfaStatus["factors"]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const all = [...(data?.totp ?? [])];
      setFactors(
        all.map((f: any) => ({ id: f.id, status: f.status, friendly_name: f.friendly_name }))
      );
    } catch {
      setFactors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const verifiedFactor = factors.find((f) => f.status === "verified");
  return {
    enrolled: factors.length > 0,
    verified: !!verifiedFactor,
    factorId: verifiedFactor?.id ?? factors[0]?.id ?? null,
    factors,
    loading,
    refresh,
  };
}

/** Per-tab step-up freshness window (5 min) */
const STEP_UP_WINDOW_MS = 5 * 60 * 1000;
let lastStepUpAt = 0;

export function markStepUpVerified() {
  lastStepUpAt = Date.now();
}

export function isStepUpFresh(): boolean {
  return Date.now() - lastStepUpAt < STEP_UP_WINDOW_MS;
}

export function clearStepUp() {
  lastStepUpAt = 0;
}

/**
 * Determine if the current user needs to enroll MFA based on policy.
 * Grace period is measured from account creation (profile or auth.user).
 */
export function useMfaEnrollmentRequirement() {
  const { role, user } = useAuth();
  const policy = useMfaPolicy();
  const status = useMfaStatus();

  const required = mfaRequiredForRole(role, policy);
  const created = user?.created_at ? new Date(user.created_at) : null;
  const graceEndsAt = created
    ? new Date(created.getTime() + policy.gracePeriodDays * 24 * 60 * 60 * 1000)
    : null;
  const inGrace = graceEndsAt ? graceEndsAt.getTime() > Date.now() : true;

  return {
    required,
    enrolled: status.verified,
    inGrace,
    graceEndsAt,
    blocking: required && !status.verified && !inGrace,
    loading: status.loading,
  };
}

/* -------------------------------------------------------------------------- */
/* Session gate: is this admin's session MFA-satisfied right now?             */
/* -------------------------------------------------------------------------- */

export type MfaGateState =
  | "loading"
  /** No MFA requirement for this user */
  | "not_required"
  /** Requirement satisfied (verified factor + fresh session/trusted device) */
  | "satisfied"
  /** Must enroll an authenticator app before continuing */
  | "enroll_required"
  /** Enrolled, but this session/device needs a fresh 6-digit code */
  | "challenge_required";

export interface MfaGate {
  state: MfaGateState;
  required: boolean;
  enrolled: boolean;
  /** Supabase assurance level of the live session: aal1 (password) or aal2 (MFA) */
  assuranceLevel: string | null;
  trustWindowHours: number;
  trustExpiresAt: number | null;
  /** Call after a successful challenge to trust this device for the window */
  confirmVerified: () => void;
  refresh: () => Promise<void>;
}

/**
 * Decides whether the current user may see admin surfaces.
 *
 * Order of authority:
 *  1. Policy + current role decide *whether* MFA is required.
 *  2. A verified TOTP factor must exist (otherwise: enroll).
 *  3. The live session must be AAL2 (server-side proof the code was entered)
 *     OR the device must be inside the trust window from an earlier AAL2
 *     verification in this browser.
 */
export function useMfaGate(): MfaGate {
  const { role, user } = useAuth();
  const policy = useMfaPolicy();
  const status = useMfaStatus();
  const [aal, setAal] = useState<string | null>(null);
  const [aalLoading, setAalLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const readAal = useCallback(async () => {
    setAalLoading(true);
    try {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      setAal(data?.currentLevel ?? null);
    } catch {
      setAal(null);
    } finally {
      setAalLoading(false);
    }
  }, []);

  useEffect(() => {
    void readAal();
  }, [readAal, user?.id, tick]);

  const required = mfaRequiredForRole(role, policy);
  const trusted = isDeviceTrusted({
    userId: user?.id,
    role: role ?? null,
    windowHours: policy.trustWindowHours,
  });

  const confirmVerified = useCallback(() => {
    markMfaVerified(user?.id, role ?? null);
    setTick((n) => n + 1);
    void status.refresh();
  }, [user?.id, role, status]);

  const refresh = useCallback(async () => {
    await Promise.all([readAal(), status.refresh()]);
  }, [readAal, status]);

  let state: MfaGateState = "loading";
  if (!status.loading && !aalLoading) {
    if (!required) state = "not_required";
    else if (!status.verified) state = "enroll_required";
    else if (aal === "aal2" || trusted) state = "satisfied";
    else state = "challenge_required";
  }

  return {
    state,
    required,
    enrolled: status.verified,
    assuranceLevel: aal,
    trustWindowHours: policy.trustWindowHours,
    trustExpiresAt: trustExpiresAt({ userId: user?.id, windowHours: policy.trustWindowHours }),
    confirmVerified,
    refresh,
  };
}

/** Drop this device's trust — used on MFA reset, disable, and sign-out. */
export function revokeDeviceTrust(userId: string | null | undefined) {
  clearMfaTrust(userId);
  clearStepUp();
}

/** Unused single-use recovery codes left for the signed-in user. */
export function useBackupCodeCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["mfa-backup-codes-remaining", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("mfa_backup_codes_remaining");
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
}
