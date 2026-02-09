import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import type { BookingState } from "@/lib/bookingStateMachine";

export type Booking = Tables<"bookings">;
export type BookingInsert = TablesInsert<"bookings">;
export type BookingStateLog = Tables<"booking_state_log">;
export type Payment = Tables<"payments">;
export type Message = Tables<"messages">;

// ── Bookings list (with unit name join) ──
export function useBookings(filters?: {
  state?: BookingState | null;
  unitId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}) {
  return useQuery({
    queryKey: ["bookings", filters],
    queryFn: async () => {
      let query = supabase
        .from("bookings")
        .select("*, units(name)")
        .order("created_at", { ascending: false });

      if (filters?.state) query = query.eq("state", filters.state);
      if (filters?.unitId) query = query.eq("unit_id", filters.unitId);
      if (filters?.dateFrom) query = query.gte("check_in", filters.dateFrom);
      if (filters?.dateTo) query = query.lte("check_out", filters.dateTo);

      const { data, error } = await query;
      if (error) throw error;
      return data as (Booking & { units: { name: string } | null })[];
    },
  });
}

// ── Single booking ──
export function useBooking(id: string | null) {
  return useQuery({
    queryKey: ["booking", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, units(name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as Booking & { units: { name: string } | null };
    },
  });
}

// ── Create booking ──
export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (booking: BookingInsert) => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = { ...booking, created_by: user?.id ?? null };

      const { data, error } = await supabase.from("bookings").insert(payload).select().single();
      if (error) throw error;

      // Log the initial state
      await supabase.from("booking_state_log").insert({
        booking_id: data.id,
        to_state: data.state,
        changed_by: user?.id ?? null,
        reason: "Booking created",
      });

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

// ── Transition state ──
export function useTransitionBookingState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      bookingId,
      fromState,
      toState,
      reason,
    }: {
      bookingId: string;
      fromState: BookingState;
      toState: BookingState;
      reason: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Update booking state
      const { data, error } = await supabase
        .from("bookings")
        .update({ state: toState })
        .eq("id", bookingId)
        .select()
        .single();
      if (error) throw error;

      // Write audit log
      await supabase.from("booking_state_log").insert({
        booking_id: bookingId,
        from_state: fromState,
        to_state: toState,
        changed_by: user?.id ?? null,
        reason,
      });

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["booking"] });
      qc.invalidateQueries({ queryKey: ["bookingStateLog"] });
    },
  });
}

// ── State log for a booking ──
export function useBookingStateLog(bookingId: string | null) {
  return useQuery({
    queryKey: ["bookingStateLog", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_state_log")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as BookingStateLog[];
    },
  });
}

// ── Payments for a booking ──
export function useBookingPayments(bookingId: string | null) {
  return useQuery({
    queryKey: ["bookingPayments", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payment: {
      booking_id: string;
      amount: number;
      method: string;
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("payments")
        .insert({ ...payment, recorded_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["bookingPayments", vars.booking_id] });
    },
  });
}

// ── Messages for a booking ──
export function useBookingMessages(bookingId: string | null) {
  return useQuery({
    queryKey: ["bookingMessages", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Message[];
    },
  });
}

export function useCreateMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (message: {
      booking_id: string;
      content: string;
      is_internal: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("messages")
        .insert({ ...message, sender_id: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["bookingMessages", vars.booking_id] });
    },
  });
}
