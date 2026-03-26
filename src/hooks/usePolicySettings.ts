import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Json } from "@/integrations/supabase/types";

export type PolicySetting = Tables<"policy_settings">;

export function usePolicySettings() {
  return useQuery({
    queryKey: ["policy_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("policy_settings")
        .select("*")
        .order("key", { ascending: true });
      if (error) throw error;
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
