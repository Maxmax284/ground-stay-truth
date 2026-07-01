import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProperty } from "@/hooks/useProperty";
import { notifyViaMessaging } from "@/lib/notifyMessaging";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";

export function useHousekeepingTasks() {
  const { activePropertyId } = useProperty();
  return useQuery({
    queryKey: ["housekeeping_tasks", activePropertyId],
    queryFn: async () => {
      let query = supabase
        .from("housekeeping_tasks")
        .select("*, units(name), booking_out:bookings!housekeeping_tasks_booking_out_id_fkey(id, check_out, guest_id, manual_guest_name, manual_guest_email, manual_guest_phone, profiles:profiles!bookings_guest_id_profiles_fkey(full_name, email)), booking_in:bookings!housekeeping_tasks_booking_in_id_fkey(id, check_in, guest_id, manual_guest_name, manual_guest_email, manual_guest_phone, profiles:profiles!bookings_guest_id_profiles_fkey(full_name, email))")
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
        .select("*, units(name), booking_in:bookings!housekeeping_tasks_booking_in_id_fkey(id, guest_id, check_in, profiles:profiles!bookings_guest_id_profiles_fkey(full_name))")
        .single();
      if (error) throw error;

      // ── Outbound bridge: room ready (only on completion) ──
      if (status === "completed") {
        const unitName = (data as any).units?.name ?? "Unit";
        const nextBooking = (data as any).booking_in;
        const today = new Date().toISOString().slice(0, 10);

        // Notify supervisors + front desk that room is ready
        notifyViaMessaging({
          event_type: "room_ready",
          subject_id: id,
          metadata: {
            unit_name: unitName,
            next_guest_name: nextBooking ? resolveGuestDisplayName(nextBooking as any) : "next arrival",
          },
        });

        // Notify the incoming guest only if they're checking in today
        if (nextBooking?.guest_id && nextBooking.check_in === today) {
          notifyViaMessaging({
            event_type: "room_ready_guest",
            subject_id: id,
            guest_user_id: nextBooking.guest_id,
            metadata: { unit_name: unitName },
          });
        }
      }

      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["housekeeping_tasks"] }),
  });
}

export function usePendingHousekeepingCount() {
  const { activePropertyId } = useProperty();
  return useQuery({
    queryKey: ["housekeeping_tasks", "pending_count", activePropertyId],
    queryFn: async () => {
      let query = supabase
        .from("housekeeping_tasks")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending", "in_progress"]);
      if (activePropertyId) query = query.eq("property_id", activePropertyId);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
}
