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

export interface MfaPolicy {
  requiredForAdmin: boolean;
  requiredForManager: boolean;
  requiredForStaff: boolean;
  gracePeriodDays: number;
  requireForSensitiveActions: boolean;
}

const DEFAULT_POLICY: MfaPolicy = {
  requiredForAdmin: true,
  requiredForManager: true,
  requiredForStaff: false,
  gracePeriodDays: 7,
  requireForSensitiveActions: true,
};

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
      requiredForAdmin: readBool(map, "mfa_required_admin", true),
      requiredForManager: readBool(map, "mfa_required_manager", true),
      requiredForStaff: readBool(map, "mfa_required_staff", false),
      gracePeriodDays: readNum(map, "mfa_grace_period_days", 7),
      requireForSensitiveActions: readBool(map, "mfa_required_sensitive_actions", true),
    };
  }, [policies]);
}

export function mfaRequiredForRole(role: AppRole | null, policy: MfaPolicy): boolean {
  if (!role) return false;
  if (role === "admin") return policy.requiredForAdmin;
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
