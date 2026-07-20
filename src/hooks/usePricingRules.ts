import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { bumpStayCacheVersion } from "@/lib/stayCacheBust";

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
      // Check for overlapping rules on the same unit
      const { data: existing } = await supabase
        .from("pricing_rules")
        .select("id, name, start_date, end_date")
        .eq("unit_id", rule.unit_id)
        .lte("start_date", rule.end_date)
        .gte("end_date", rule.start_date);
      if (existing && existing.length > 0) {
        throw new Error(`Date range overlaps with existing rule "${existing[0].name}" (${existing[0].start_date} – ${existing[0].end_date})`);
      }
      const { data, error } = await supabase.from("pricing_rules").insert(rule).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing_rules"] });
      bumpStayCacheVersion("pricing_rule_created");
    },
  });
}

export function useUpdatePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: PricingRuleUpdate & { id: string }) => {
      // Check for overlapping rules on the same unit (exclude self)
      if (updates.unit_id && updates.start_date && updates.end_date) {
        const { data: existing } = await supabase
          .from("pricing_rules")
          .select("id, name, start_date, end_date")
          .eq("unit_id", updates.unit_id)
          .neq("id", id)
          .lte("start_date", updates.end_date)
          .gte("end_date", updates.start_date);
        if (existing && existing.length > 0) {
          throw new Error(`Date range overlaps with existing rule "${existing[0].name}" (${existing[0].start_date} – ${existing[0].end_date})`);
        }
      }
      const { data, error } = await supabase.from("pricing_rules").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing_rules"] });
      bumpStayCacheVersion("pricing_rule_updated");
    },
  });
}

export function useDeletePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pricing_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing_rules"] });
      bumpStayCacheVersion("pricing_rule_deleted");
    },
  });
}
