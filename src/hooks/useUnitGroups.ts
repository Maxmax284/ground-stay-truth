import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UnitGroup {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useUnitGroups() {
  return useQuery({
    queryKey: ["unit-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unit_groups")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as UnitGroup[];
    },
  });
}

export function useCreateUnitGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (group: { name: string; description?: string }) => {
      const { data, error } = await supabase.from("unit_groups").insert(group).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["unit-groups"] }),
  });
}

export function useUpdateUnitGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; description?: string; sort_order?: number; is_active?: boolean }) => {
      const { data, error } = await supabase.from("unit_groups").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["unit-groups"] }),
  });
}

export function useDeleteUnitGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("unit_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unit-groups"] });
      qc.invalidateQueries({ queryKey: ["units"] });
    },
  });
}
