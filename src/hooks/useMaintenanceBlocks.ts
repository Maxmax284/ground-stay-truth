import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MaintenanceBlock {
  id: string;
  unit_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export function useMaintenanceBlocks(filters?: {
  dateFrom?: string | null;
  dateTo?: string | null;
  unitId?: string | null;
}) {
  return useQuery({
    queryKey: ["maintenance_blocks", filters],
    queryFn: async () => {
      let query = supabase
        .from("maintenance_blocks")
        .select("*")
        .order("start_date", { ascending: true });

      if (filters?.unitId) query = query.eq("unit_id", filters.unitId);
      if (filters?.dateFrom) query = query.gte("end_date", filters.dateFrom);
      if (filters?.dateTo) query = query.lte("start_date", filters.dateTo);

      const { data, error } = await query;
      if (error) throw error;
      return data as MaintenanceBlock[];
    },
  });
}

export function useCreateMaintenanceBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (block: {
      unit_id: string;
      start_date: string;
      end_date: string;
      reason?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("maintenance_blocks")
        .insert({ ...block, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance_blocks"] });
    },
  });
}

export function useDeleteMaintenanceBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("maintenance_blocks")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance_blocks"] });
    },
  });
}
