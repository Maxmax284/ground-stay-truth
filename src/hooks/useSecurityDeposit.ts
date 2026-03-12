import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSecurityDeposit(bookingId: string | null) {
  return useQuery({
    queryKey: ["security_deposit", bookingId],
    queryFn: async () => {
      if (!bookingId) return null;
      const { data, error } = await supabase
        .from("security_deposits")
        .select("*")
        .eq("booking_id", bookingId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!bookingId,
  });
}

export function useCreateSecurityDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ booking_id, amount_held }: { booking_id: string; amount_held: number }) => {
      const { data, error } = await supabase
        .from("security_deposits")
        .insert({ booking_id, amount_held })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["security_deposit", vars.booking_id] }),
  });
}

export function useUpdateSecurityDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, booking_id, ...updates }: { id: string; booking_id: string; status?: string; amount_deducted?: number; deduction_reason?: string; notes?: string; inspected_by?: string; released_by?: string }) => {
      const payload: Record<string, any> = { ...updates };
      if (updates.status === "inspected") payload.inspected_at = new Date().toISOString();
      if (updates.status === "released" || updates.status === "deducted") payload.released_at = new Date().toISOString();
      const { data, error } = await supabase
        .from("security_deposits")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["security_deposit", vars.booking_id] }),
  });
}
