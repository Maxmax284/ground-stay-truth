import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useTrainingPackages() {
  return useQuery({
    queryKey: ["training_packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_packages")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateTrainingPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pkg: { name: string; description?: string; duration_days: number; price: number }) => {
      const { data, error } = await supabase.from("training_packages").insert(pkg).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["training_packages"] }),
  });
}

export function useUpdateTrainingPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; description?: string; duration_days?: number; price?: number; is_active?: boolean }) => {
      const { data, error } = await supabase.from("training_packages").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["training_packages"] }),
  });
}

export function useBookingTrainingLinks(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["booking_training_links", bookingId],
    queryFn: async () => {
      if (!bookingId) return [];
      const { data, error } = await supabase
        .from("booking_training_links")
        .select("*, training_packages(name, duration_days, price)")
        .eq("booking_id", bookingId);
      if (error) throw error;
      return data;
    },
    enabled: !!bookingId,
  });
}

export function useLinkBookingTraining() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (link: { booking_id: string; package_id: string; trainer_name?: string; start_date?: string; notes?: string }) => {
      const { data, error } = await supabase.from("booking_training_links").insert(link).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["booking_training_links", vars.booking_id] }),
  });
}

export function useActiveTrainingCount() {
  return useQuery({
    queryKey: ["active_training_count"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { count, error } = await supabase
        .from("booking_training_links")
        .select("*, bookings!inner(state)", { count: "exact", head: true })
        .in("bookings.state", ["confirmed", "checked_in"]);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
}
