import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProperty } from "@/hooks/useProperty";

export function useHousekeepingTasks() {
  const { activePropertyId } = useProperty();
  return useQuery({
    queryKey: ["housekeeping_tasks", activePropertyId],
    queryFn: async () => {
      let query = supabase
        .from("housekeeping_tasks")
        .select("*, units(name), booking_out:bookings!housekeeping_tasks_booking_out_id_fkey(id, check_out, guest_id, profiles:profiles!bookings_guest_id_profiles_fkey(full_name)), booking_in:bookings!housekeeping_tasks_booking_in_id_fkey(id, check_in, guest_id, profiles:profiles!bookings_guest_id_profiles_fkey(full_name))")
        .order("created_at", { ascending: false });
      if (activePropertyId) query = query.eq("property_id", activePropertyId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateHousekeepingTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, notes, assigned_to }: { id: string; status?: string; notes?: string; assigned_to?: string | null }) => {
      const updates: Record<string, any> = {};
      if (status !== undefined) updates.status = status;
      if (notes !== undefined) updates.notes = notes;
      if (assigned_to !== undefined) updates.assigned_to = assigned_to;
      if (status === "completed") updates.completed_at = new Date().toISOString();
      const { data, error } = await supabase
        .from("housekeeping_tasks")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["housekeeping_tasks"] }),
  });
}

export function usePendingHousekeepingCount() {
  return useQuery({
    queryKey: ["housekeeping_tasks", "pending_count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("housekeeping_tasks")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending", "in_progress"]);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
}
