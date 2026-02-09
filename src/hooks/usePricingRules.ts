import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type PricingRule = Tables<"pricing_rules">;
export type PricingRuleInsert = TablesInsert<"pricing_rules">;
export type PricingRuleUpdate = TablesUpdate<"pricing_rules">;

export function usePricingRules(unitId?: string | null) {
  return useQuery({
    queryKey: ["pricing_rules", unitId],
    queryFn: async () => {
      let query = supabase
        .from("pricing_rules")
        .select("*, units(name)")
        .order("start_date", { ascending: true });
      if (unitId) query = query.eq("unit_id", unitId);
      const { data, error } = await query;
      if (error) throw error;
      return data as (PricingRule & { units: { name: string } | null })[];
    },
  });
}

export function useCreatePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: PricingRuleInsert) => {
      const { data, error } = await supabase.from("pricing_rules").insert(rule).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing_rules"] }),
  });
}

export function useUpdatePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: PricingRuleUpdate & { id: string }) => {
      const { data, error } = await supabase.from("pricing_rules").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing_rules"] }),
  });
}

export function useDeletePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pricing_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing_rules"] }),
  });
}
