/**
 * useTrustedDevices — admin device recognition.
 *
 * MFA proves the person. This proves the machine.
 *
 * DEFAULT OFF: with no policy rows saved, `policy.enabled` is false and this
 * hook only records "this device was seen" for admin-level users. Nothing is
 * blocked, no flow changes.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { useLogStaffAudit } from "@/hooks/useStaffAudit";
import {
  DEFAULT_DEVICE_POLICY,
  DEVICE_POLICY_KEYS,
  computeDeviceExpiry,
  describeDevice,
  deviceGateDecision,
  deviceRecognitionAppliesTo,
  getOrCreateDeviceKey,
  isDeviceRestricted,
  parseDevicePolicy,
  setDeviceRestricted,
  type DeviceGateState,
  type DevicePolicy,
  type DeviceStatus,
} from "@/lib/deviceRecognition";

export interface TrustedDeviceRow {
  id: string;
  user_id: string;
  device_key: string;
  label: string;
  device_type: string;
  browser: string | null;
  os: string | null;
  user_agent: string | null;
  ip_address: string | null;
  status: DeviceStatus;
  first_seen_at: string;
  last_seen_at: string;
  approved_by: string | null;
  approved_at: string | null;
  last_mfa_verified_at: string | null;
  expires_at: string | null;
  is_sandbox: boolean;
}

const TABLE = "trusted_devices";

/* -------------------------------------------------------------------------- */
/* Policy                                                                     */
/* -------------------------------------------------------------------------- */

export function useDevicePolicy(): { policy: DevicePolicy; loading: boolean } {
  const { data, isLoading } = usePolicySettings();
  const policy = useMemo(() => {
    if (!data) return { ...DEFAULT_DEVICE_POLICY };
    return parseDevicePolicy(
      data
        .filter((r) => !r.property_id)
        .map((r) => ({ key: r.key, value: r.value as unknown }))
    );
  }, [data]);
  return { policy, loading: isLoading };
}

export function useSaveDevicePolicy() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const logAudit = useLogStaffAudit();

  return useMutation({
    mutationFn: async (next: DevicePolicy) => {
      const values: Array<[string, unknown]> = [
        [DEVICE_POLICY_KEYS.enabled, next.enabled],
        [DEVICE_POLICY_KEYS.requireApproval, next.requireApproval],
        [DEVICE_POLICY_KEYS.allowSelfApproval, next.allowSelfApproval],
        [DEVICE_POLICY_KEYS.requireMfaOnNewDevice, next.requireMfaOnNewDevice],
        [DEVICE_POLICY_KEYS.trustDays, next.trustDays],
        [DEVICE_POLICY_KEYS.revokeOnPasswordChange, next.revokeOnPasswordChange],
        [DEVICE_POLICY_KEYS.revokeOnMfaReset, next.revokeOnMfaReset],
        [DEVICE_POLICY_KEYS.revokeOnRoleChange, next.revokeOnRoleChange],
      ];

      for (const [key, value] of values) {
        const { data: existing } = await supabase
          .from("policy_settings")
          .select("id")
          .eq("key", key)
          .is("property_id", null)
          .maybeSingle();
        if (existing) {
          const { error } = await supabase
            .from("policy_settings")
            .update({ value: value as never, updated_by: user?.id ?? null })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("policy_settings")
            .insert({ key, value: value as never, updated_by: user?.id ?? null });
          if (error) throw error;
        }
      }
      return next;
    },
    onSuccess: (next) => {
      logAudit.mutate({
        eventType: next.enabled ? "device_recognition_enabled" : "device_recognition_disabled",
        severity: "high",
        reason: next.enabled
          ? "Admin turned on device recognition"
          : "Admin turned off device recognition",
        metadata: { ...next },
      });
      qc.invalidateQueries({ queryKey: ["policy_settings"] });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Device list                                                                */
/* -------------------------------------------------------------------------- */

export function useCurrentDeviceKey(): string {
  const ref = useRef<string | null>(null);
  if (!ref.current) ref.current = getOrCreateDeviceKey();
  return ref.current;
}

export interface TrustedDeviceWithOwner extends TrustedDeviceRow {
  owner_name: string | null;
  owner_email: string | null;
}

/** All device records the caller may see (admins see everyone's). */
export function useTrustedDevices() {
  const { user, isAdmin } = useAuth();
  return useQuery({
    queryKey: ["trusted-devices", user?.id, isAdmin],
    enabled: !!user?.id,
    queryFn: async (): Promise<TrustedDeviceWithOwner[]> => {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as TrustedDeviceRow[];
      if (rows.length === 0) return [];

      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);
      const byUser = new Map((profiles ?? []).map((p) => [p.user_id, p]));

      return rows.map((r) => ({
        ...r,
        owner_name: byUser.get(r.user_id)?.full_name ?? null,
        owner_email: byUser.get(r.user_id)?.email ?? null,
      }));
    },
  });
}

/**
 * Records "this browser was seen" for admin-level users. Safe with enforcement
 * off — it only writes a pending row and a last-seen stamp.
 */
export function useRegisterCurrentDevice() {
  const { user, role } = useAuth();
  const deviceKey = useCurrentDeviceKey();
  const qc = useQueryClient();
  const logAudit = useLogStaffAudit();
  const done = useRef(false);

  useEffect(() => {
    if (!user?.id || !deviceRecognitionAppliesTo(role) || done.current) return;
    done.current = true;

    void (async () => {
      const desc = describeDevice(typeof navigator !== "undefined" ? navigator.userAgent : null);
      const { data: existing } = await supabase
        .from(TABLE)
        .select("id, status")
        .eq("user_id", user.id)
        .eq("device_key", deviceKey)
        .maybeSingle();

      if (existing) {
        await supabase
          .from(TABLE)
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        const { error } = await supabase.from(TABLE).insert({
          user_id: user.id,
          device_key: deviceKey,
          label: desc.label,
          device_type: desc.deviceType,
          browser: desc.browser,
          os: desc.os,
          user_agent: desc.label, // human-friendly only; no raw fingerprint stored
          status: "pending",
        });
        if (!error) {
          logAudit.mutate({
            eventType: "device_detected",
            severity: "medium",
            reason: "New admin device seen",
            metadata: { label: desc.label, device_type: desc.deviceType, os: desc.os },
          });
        }
      }
      qc.invalidateQueries({ queryKey: ["trusted-devices"] });
    })();
  }, [user?.id, role, deviceKey, qc, logAudit]);
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                  */
/* -------------------------------------------------------------------------- */

type DeviceAction =
  | { kind: "approve"; device: TrustedDeviceRow; selfApproved: boolean }
  | { kind: "revoke"; device: TrustedDeviceRow }
  | { kind: "block"; device: TrustedDeviceRow }
  | { kind: "unblock"; device: TrustedDeviceRow }
  | { kind: "rename"; device: TrustedDeviceRow; label: string }
  | { kind: "remove"; device: TrustedDeviceRow };

export function useDeviceActions() {
  const { user } = useAuth();
  const { policy } = useDevicePolicy();
  const qc = useQueryClient();
  const logAudit = useLogStaffAudit();

  return useMutation({
    mutationFn: async (action: DeviceAction) => {
      const id = action.device.id;
      if (action.kind === "remove") {
        const { error } = await supabase.from(TABLE).delete().eq("id", id);
        if (error) throw error;
        return action;
      }

      const patch: Record<string, unknown> = {};
      if (action.kind === "approve") {
        patch.status = "trusted";
        patch.approved_by = user?.id ?? null;
        patch.approved_at = new Date().toISOString();
        patch.expires_at = computeDeviceExpiry(policy.trustDays);
        patch.last_mfa_verified_at = new Date().toISOString();
      } else if (action.kind === "revoke") {
        patch.status = "revoked";
        patch.expires_at = null;
      } else if (action.kind === "block") {
        patch.status = "blocked";
        patch.expires_at = null;
      } else if (action.kind === "unblock") {
        patch.status = "pending";
      } else if (action.kind === "rename") {
        patch.label = action.label.slice(0, 80);
      }

      const { error } = await supabase.from(TABLE).update(patch).eq("id", id);
      if (error) throw error;
      return action;
    },
    onSuccess: (action) => {
      const { device } = action;
      const isSelf = device.user_id === user?.id;
      const eventType =
        action.kind === "approve"
          ? action.selfApproved
            ? "device_self_approved"
            : "device_approved"
          : action.kind === "revoke"
            ? "device_revoked"
            : action.kind === "block"
              ? "device_blocked"
              : action.kind === "unblock"
                ? "device_unblocked"
                : action.kind === "rename"
                  ? "device_renamed"
                  : "device_removed";

      logAudit.mutate({
        eventType: eventType as never,
        severity: action.kind === "approve" || action.kind === "rename" ? "info" : "high",
        targetUserId: isSelf ? null : device.user_id,
        reason: `${action.kind} device "${device.label}"`,
        metadata: {
          device_id: device.id,
          device_label: action.kind === "rename" ? action.label : device.label,
          before_status: device.status,
          self_device: isSelf,
          result: "success",
        },
      });
      qc.invalidateQueries({ queryKey: ["trusted-devices"] });
    },
    onError: (err, action) => {
      logAudit.mutate({
        eventType: "device_action_failed" as never,
        severity: "high",
        reason: `${action.kind} failed: ${(err as Error)?.message ?? "unknown"}`,
        metadata: { device_id: action.device.id, result: "failure" },
      });
    },
  });
}

/** Pull trust for every device of a user (MFA reset, password change, role change). */
export function useRevokeUserDevices() {
  const qc = useQueryClient();
  const logAudit = useLogStaffAudit();
  return useMutation({
    mutationFn: async ({ userId }: { userId: string; reason: string }) => {
      const { error } = await supabase
        .from(TABLE)
        .update({ status: "revoked", expires_at: null })
        .eq("user_id", userId)
        .in("status", ["trusted", "pending"]);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      logAudit.mutate({
        eventType: "device_trust_bulk_revoked" as never,
        severity: "high",
        targetUserId: vars.userId,
        reason: vars.reason,
        metadata: { result: "success" },
      });
      qc.invalidateQueries({ queryKey: ["trusted-devices"] });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Gate                                                                      */
/* -------------------------------------------------------------------------- */

export interface DeviceGate {
  state: DeviceGateState;
  policy: DevicePolicy;
  restricted: boolean;
  currentDevice: TrustedDeviceRow | null;
  canSelfApprove: boolean;
  approveCurrent: () => Promise<void>;
  refresh: () => void;
}

export function useDeviceGate(): DeviceGate {
  const { role, user } = useAuth();
  const { policy, loading: policyLoading } = useDevicePolicy();
  const deviceKey = useCurrentDeviceKey();
  const devices = useTrustedDevices();
  const actions = useDeviceActions();
  const qc = useQueryClient();

  const currentDevice = useMemo(
    () =>
      (devices.data ?? []).find((d) => d.device_key === deviceKey && d.user_id === user?.id) ?? null,
    [devices.data, deviceKey, user?.id]
  );

  const state: DeviceGateState =
    policyLoading || devices.isLoading
      ? "loading"
      : deviceGateDecision({ policy, role, device: currentDevice });

  const restricted = isDeviceRestricted(state);

  useEffect(() => {
    setDeviceRestricted(restricted);
  }, [restricted]);

  /**
   * Approve the machine we are on. If the "seen" row has not landed yet (fresh
   * browser, slow insert, trust pulled by a password change) we create it here
   * instead of leaving the admin staring at a dead button — the row is still
   * written as pending first, so the database rules decide the rest.
   */
  const approveCurrent = useCallback(async () => {
    if (!user?.id) throw new Error("Sign in again to approve this device.");
    let device = currentDevice as TrustedDeviceRow | null;

    if (!device) {
      const { data: found } = await supabase
        .from(TABLE)
        .select("*")
        .eq("user_id", user.id)
        .eq("device_key", deviceKey)
        .maybeSingle();
      device = (found as TrustedDeviceRow | null) ?? null;
    }

    if (!device) {
      const desc = describeDevice(typeof navigator !== "undefined" ? navigator.userAgent : null);
      const { data: created, error } = await supabase
        .from(TABLE)
        .insert({
          user_id: user.id,
          device_key: deviceKey,
          label: desc.label,
          device_type: desc.deviceType,
          browser: desc.browser,
          os: desc.os,
          user_agent: desc.label,
          status: "pending",
        })
        .select("*")
        .maybeSingle();
      if (error) throw error;
      device = (created as TrustedDeviceRow | null) ?? null;
    }

    if (!device) throw new Error("Could not register this device. Try again.");
    await actions.mutateAsync({ kind: "approve", device, selfApproved: true });
    await qc.invalidateQueries({ queryKey: ["trusted-devices"] });
  }, [actions, currentDevice, deviceKey, qc, user?.id]);

  return {
    state,
    policy,
    restricted,
    currentDevice,
    canSelfApprove: policy.allowSelfApproval,
    approveCurrent,
    refresh: () => qc.invalidateQueries({ queryKey: ["trusted-devices"] }),
  };
}
