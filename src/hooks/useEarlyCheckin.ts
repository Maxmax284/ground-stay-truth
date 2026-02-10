import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BLOCKING_STATES } from "@/lib/bookingStateMachine";

// ── Buffer violation detection ──
// Checks if a booking's check-in date falls within the cleaning buffer
// of the previous booking on the same unit.
export function useBufferViolation(
  unitId: string | null,
  bookingId: string | null,
  checkInDate: string | null,
  cleaningBufferHours: number
) {
  return useQuery({
    queryKey: ["bufferViolation", unitId, bookingId, checkInDate, cleaningBufferHours],
    enabled: !!unitId && !!checkInDate && cleaningBufferHours > 0,
    queryFn: async () => {
      // Find the most recent booking on this unit that checks out
      // at or before our check-in, in a blocking state
      const { data, error } = await supabase
        .from("bookings")
        .select("id, check_out, state")
        .eq("unit_id", unitId!)
        .neq("id", bookingId ?? "")
        .in("state", BLOCKING_STATES)
        .lte("check_out", checkInDate!)
        .order("check_out", { ascending: false })
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) return { violated: false, hoursShort: 0 };

      const prevCheckOut = new Date(data[0].check_out);
      const ourCheckIn = new Date(checkInDate!);
      const gapHours = (ourCheckIn.getTime() - prevCheckOut.getTime()) / (1000 * 60 * 60);

      if (gapHours < cleaningBufferHours) {
        return {
          violated: true,
          hoursShort: Math.round(cleaningBufferHours - gapHours),
          previousBookingId: data[0].id,
          previousCheckOut: data[0].check_out,
        };
      }

      return { violated: false, hoursShort: 0 };
    },
  });
}

// ── Early check-in request for a booking ──
export function useEarlyCheckinRequest(bookingId: string | null) {
  return useQuery({
    queryKey: ["earlyCheckinRequest", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("early_checkin_requests" as any)
        .select("*")
        .eq("booking_id", bookingId!)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data as any[])?.[0] ?? null;
    },
  });
}

// ── Create escalation request ──
export function useCreateEarlyCheckinRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      bookingId: string;
      reason: string;
      bufferViolationHours: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("early_checkin_requests" as any)
        .insert({
          booking_id: params.bookingId,
          requested_by: user?.id ?? null,
          reason: params.reason,
          buffer_violation_hours: params.bufferViolationHours,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["earlyCheckinRequest", vars.bookingId] });
      qc.invalidateQueries({ queryKey: ["pendingEarlyCheckins"] });
    },
  });
}

// ── Approve / Deny request (Manager+) ──
export function useResolveEarlyCheckinRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      requestId: string;
      bookingId: string;
      status: "approved" | "denied";
      responseNote?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("early_checkin_requests" as any)
        .update({
          status: params.status,
          approved_by: user?.id ?? null,
          response_note: params.responseNote ?? null,
          resolved_at: new Date().toISOString(),
        } as any)
        .eq("id", params.requestId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["earlyCheckinRequest", vars.bookingId] });
      qc.invalidateQueries({ queryKey: ["pendingEarlyCheckins"] });
    },
  });
}

// ── All pending early check-in requests (for manager dashboard) ──
export function usePendingEarlyCheckins() {
  return useQuery({
    queryKey: ["pendingEarlyCheckins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("early_checkin_requests" as any)
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });
}
