import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Unit = Tables<"units"> & { unit_groups?: { name: string } | null };
export type UnitInsert = TablesInsert<"units">;
export type UnitUpdate = TablesUpdate<"units">;

export function useUnits() {
  return useQuery({
    queryKey: ["units"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("*, unit_groups(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Unit[];
    },
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (unit: UnitInsert) => {
      const { data, error } = await supabase.from("units").insert(unit).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["units"] }),
  });
}

export function useUpdateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: UnitUpdate & { id: string }) => {
      const { data, error } = await supabase.from("units").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["stay-essentials"] });
    },
  });
}

export async function checkUnitHasLinkedRecords(id: string): Promise<boolean> {
  const [bookings, maintenance, laundry] = await Promise.all([
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("unit_id", id),
    supabase.from("maintenance_requests").select("id", { count: "exact", head: true }).eq("unit_id", id),
    supabase.from("laundry_requests").select("id", { count: "exact", head: true }).eq("unit_id", id),
  ]);
  return (bookings.count ?? 0) > 0 || (maintenance.count ?? 0) > 0 || (laundry.count ?? 0) > 0;
}

export function useDeleteUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const hasLinked = await checkUnitHasLinkedRecords(id);
      if (hasLinked) {
        throw new Error("UNIT_HAS_HISTORY");
      }
      const { error } = await supabase.from("units").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["units"] }),
  });
}
