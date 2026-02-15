import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import type { BookingState } from "@/lib/bookingStateMachine";
import { createNotification } from "@/hooks/useNotifications";

export type Booking = Tables<"bookings">;
export type BookingInsert = TablesInsert<"bookings">;
export type BookingStateLog = Tables<"booking_state_log">;
export type Payment = Tables<"payments">;
export type Message = Tables<"messages">;
export type BookingWithJoins = Booking & {
  units: { name: string } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

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
      let query = (supabase
        .from("bookings")
        .select("*, units(name), profiles!bookings_guest_id_profiles_fkey(full_name, email)")
        .order("created_at", { ascending: false })) as any;

      if (filters?.state) query = query.eq("state", filters.state);
      if (filters?.unitId) query = query.eq("unit_id", filters.unitId);
      if (filters?.dateFrom) query = query.gte("check_in", filters.dateFrom);
      if (filters?.dateTo) query = query.lte("check_out", filters.dateTo);

      const { data, error } = await query;
      if (error) throw error;
      return data as BookingWithJoins[];
    },
  });
}

// ── Single booking ──
export function useBooking(id: string | null) {
  return useQuery({
    queryKey: ["booking", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("bookings")
        .select("*, units(name), profiles!bookings_guest_id_profiles_fkey(full_name, email)")
        .eq("id", id!)
        .single() as any);
      if (error) throw error;
      return data as BookingWithJoins;
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

      // Notify admins/managers about new booking
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "manager"]);
      for (const admin of admins ?? []) {
        if (admin.user_id !== user?.id) {
          await createNotification({
            user_id: admin.user_id,
            type: "booking",
            reference_id: data.id,
            message: `New booking created for ${booking.check_in} – ${booking.check_out}`,
          });
        }
      }

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

      // Notify guest about state change
      if (data.guest_id && data.guest_id !== user?.id) {
        await createNotification({
          user_id: data.guest_id,
          type: "booking",
          reference_id: bookingId,
          message: `Your booking status changed to ${toState}`,
        });
      }

      // Notify admins/managers
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "manager"]);
      for (const admin of admins ?? []) {
        if (admin.user_id !== user?.id) {
          await createNotification({
            user_id: admin.user_id,
            type: "booking",
            reference_id: bookingId,
            message: `Booking transitioned from ${fromState} to ${toState}`,
          });
        }
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["booking"] });
      qc.invalidateQueries({ queryKey: ["bookingStateLog"] });
    },
  });
}

// ── State log for a booking (with actor name) ──
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

      // Resolve changed_by user names
      const userIds = [...new Set((data ?? []).map((l) => l.changed_by).filter(Boolean))] as string[];
      let profileMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);
        profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name ?? "Unknown"]));
      }

      return (data ?? []).map((log) => ({
        ...log,
        changed_by_name: log.changed_by ? (profileMap.get(log.changed_by) ?? null) : null,
      }));
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
      source_channel?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { source_channel, ...rest } = payment;
      const { data, error } = await supabase
        .from("payments")
        .insert({ ...rest, recorded_by: user?.id ?? null, source_channel: source_channel ?? "front_desk" } as any)
        .select()
        .single();
      if (error) throw error;

      // If the booking is in pending_deposit, notify guest about deposit receipt
      const { data: booking } = await supabase
        .from("bookings")
        .select("state, guest_id")
        .eq("id", payment.booking_id)
        .single();

      if (booking?.state === "pending_deposit" && booking.guest_id && booking.guest_id !== user?.id) {
        await createNotification({
          user_id: booking.guest_id,
          type: "booking",
          reference_id: payment.booking_id,
          message: `Your deposit of $${payment.amount.toFixed(2)} (${payment.method}) has been received. Your booking will be confirmed shortly.`,
        });
      }

      // Notify admins/managers about deposit recorded
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "manager"]);
      for (const admin of admins ?? []) {
        if (admin.user_id !== user?.id) {
          await createNotification({
            user_id: admin.user_id,
            type: "booking",
            reference_id: payment.booking_id,
            message: `Deposit of $${payment.amount.toFixed(2)} recorded via ${payment.method}`,
          });
        }
      }

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

// ── Mark messages as read ──
export function useMarkMessagesRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() } as any)
        .eq("booking_id", bookingId)
        .is("read_at", null)
        .or(`sender_id.neq.${user.id},sender_id.is.null`);
      if (error) throw error;
    },
    onSuccess: (_, bookingId) => {
      qc.invalidateQueries({ queryKey: ["bookingMessages", bookingId] });
      qc.invalidateQueries({ queryKey: ["inbox-threads"] });
      qc.invalidateQueries({ queryKey: ["guest-messages"] });
    },
  });
}
