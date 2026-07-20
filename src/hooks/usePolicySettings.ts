import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Json } from "@/integrations/supabase/types";
import { emitPolicySettingChanged } from "@/lib/fenrir/events";
import { mapRole } from "@/lib/fenrir/role-map";
import type { AppRole } from "@/lib/permissions";
import { bumpStayCacheVersion } from "@/lib/stayCacheBust";

export type PolicySetting = Tables<"policy_settings">;

/**
 * Fetch policy settings, optionally scoped to a property.
 * When propertyId is provided, returns settings that match that property
 * OR have null property_id (global defaults), with property-specific taking precedence.
 */
export function usePolicySettings(propertyId?: string | null) {
  return useQuery({
    queryKey: ["policy_settings", propertyId ?? "global"],
    queryFn: async () => {
      let query = supabase
        .from("policy_settings")
        .select("*")
        .order("key", { ascending: true });

      if (propertyId) {
        // Fetch both property-specific and global (null property_id) settings
        query = query.or(`property_id.eq.${propertyId},property_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (propertyId && data) {
        // Deduplicate: property-specific overrides global for same key
        const byKey = new Map<string, PolicySetting>();
        for (const setting of data as PolicySetting[]) {
          const existing = byKey.get(setting.key);
          if (!existing || (setting.property_id && !existing.property_id)) {
            byKey.set(setting.key, setting);
          }
        }
        return Array.from(byKey.values());
      }

      return data as PolicySetting[];
    },
  });
}

export function useUpdatePolicySetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, value }: { id: string; value: Json }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("policy_settings")
        .update({ value, updated_by: user?.id ?? null })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      // Fenrir audit — value itself is not sent (key + scope is enough)
      if (user && data) {
        try {
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .limit(1);
          const role = (roles?.[0]?.role as AppRole | undefined) ?? null;
          emitPolicySettingChanged(
            { userId: user.id, email: user.email ?? undefined, role },
            data.key,
            data.property_id ?? null,
          );
        } catch {
          // never break the update if the audit ping fails
        }
      }

      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["policy_settings"] });
      qc.invalidateQueries({ queryKey: ["stay-essentials"] });
      // Any policy edit can influence the public /stay page (currency,
      // deposit, booking fee, etc.). Cheap to bust — always bump.
      bumpStayCacheVersion(`policy_setting:${data?.key ?? "unknown"}`);
    },
  });
}
