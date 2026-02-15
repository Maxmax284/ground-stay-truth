import { useMemo } from "react";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import type { AppRole } from "@/lib/permissions";

const ROLE_KEY_MAP: Partial<Record<AppRole, string>> = {
  guest: "ai_guest_enabled",
  front_desk: "ai_front_desk_enabled",
  front_desk_supervisor: "ai_supervisor_enabled",
  manager: "ai_manager_enabled",
  admin: "ai_admin_enabled",
};

export function useAISettings(role: AppRole | null) {
  const { data: policies, isLoading } = usePolicySettings();

  return useMemo(() => {
    if (isLoading || !policies) {
      return { isAIEnabled: false, isLoading: true, isGlobalEnabled: false };
    }

    const globalSetting = policies.find((p) => p.key === "ai_assistant_enabled");
    const isGlobalEnabled = globalSetting ? String(globalSetting.value) === "true" : true;

    if (!isGlobalEnabled || !role) {
      return { isAIEnabled: false, isLoading: false, isGlobalEnabled };
    }

    // Maintenance and viewer roles don't have their own toggle — inherit global
    const roleKey = ROLE_KEY_MAP[role];
    if (!roleKey) {
      return { isAIEnabled: isGlobalEnabled, isLoading: false, isGlobalEnabled };
    }

    const roleSetting = policies.find((p) => p.key === roleKey);
    const isRoleEnabled = roleSetting ? String(roleSetting.value) === "true" : true;

    return { isAIEnabled: isGlobalEnabled && isRoleEnabled, isLoading: false, isGlobalEnabled };
  }, [policies, isLoading, role]);
}
