/**
 * React hooks for Fenrir Lock event emission.
 * Provides convenient, type-safe helpers for components/hooks.
 */
import { useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { fenrirDispatcher } from "./dispatcher";
import { mapRole } from "./role-map";
import { FENRIR_POLICY_KEYS } from "./config";
import type { FenrirEvent, FenrirEventType, FenrirSeverity } from "./types";

/** Configure the dispatcher from policy_settings */
export function useFenrirConfig() {
  const { data: policies } = usePolicySettings();

  useEffect(() => {
    if (!policies) return;

    const policyMap = new Map(policies.map((p) => [p.key, p.value]));
    const enabled = String(policyMap.get(FENRIR_POLICY_KEYS.enabled) ?? "").replace(/^"|"$/g, "") === "true";
    const endpoint = String(policyMap.get(FENRIR_POLICY_KEYS.endpoint) ?? "").replace(/^"|"$/g, "");

    fenrirDispatcher.configure({ enabled, endpoint });
  }, [policies]);
}

/** Check if the system is in emergency freeze mode */
export function useSecurityFreeze() {
  const { data: policies } = usePolicySettings();

  if (!policies) return { frozen: false, threatLevel: "normal" };

  const policyMap = new Map(policies.map((p) => [p.key, p.value]));
  const frozen = String(policyMap.get(FENRIR_POLICY_KEYS.freezeActive) ?? "").replace(/^"|"$/g, "") === "true";
  const threatLevel = String(policyMap.get(FENRIR_POLICY_KEYS.threatLevel) ?? "normal").replace(/^"|"$/g, "");

  return { frozen, threatLevel };
}

/** Hook that returns an emit function pre-filled with actor context */
export function useFenrirEmit() {
  const { user, role } = useAuth();

  const emit = useCallback(
    (
      eventType: FenrirEventType,
      severity: FenrirSeverity,
      confidenceScore: number,
      extraDetails: Record<string, unknown> = {}
    ) => {
      const event: FenrirEvent = {
        event_type: eventType,
        severity,
        confidence_score: confidenceScore,
        user_email: user?.email ?? undefined,
        details: {
          source_platform: "groundstay",
          actor_role: mapRole(role),
          actor_id: user?.id ?? "anonymous",
          actor_email: user?.email ?? undefined,
          ...extraDetails,
        },
      };
      fenrirDispatcher.emit(event);
    },
    [user, role]
  );

  return emit;
}
