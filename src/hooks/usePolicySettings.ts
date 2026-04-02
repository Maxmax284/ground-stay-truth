import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Json } from "@/integrations/supabase/types";

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
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policy_settings"] });
      qc.invalidateQueries({ queryKey: ["stay-essentials"] });
    },
  });
}
