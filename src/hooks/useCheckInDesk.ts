/**
 * Check-In Desk hook.
 *
 * Presentation-layer aggregator for the arrival/departure desk. All business
 * rules live where they already live: the state machine (`bookingStateMachine`),
 * payment math (`paymentTypes`), and the server-side email resolver
 * (`send-booking-state-email`). This hook only slices the data and drives the
 * two transitions the desk owns:
 *
 *   confirmed  → checked_in  ("arrived")
 *   checked_in → completed   ("checked out")
 *
 * Both transitions await the guest email so the desk can tell staff whether the
 * confirmation actually went out instead of firing and forgetting.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProperty } from "@/hooks/useProperty";
import { useAuth } from "@/hooks/useAuth";
import { useTransitionBookingState } from "@/hooks/useBookings";
import { calculateOutstanding } from "@/lib/paymentTypes";
import { format, addDays } from "date-fns";

export type DeskBooking = {
  id: string;
  guest_id: string | null;
  unit_id: string | null;
  check_in: string;
  check_out: string;
  num_guests: number;
  state: string;
  total_price: number | null;
  arrived_at: string | null;
  notes: string | null;
  manual_guest_name: string | null;
  manual_guest_email: string | null;
  manual_guest_phone: string | null;
  units: { name: string } | null;
  profiles: { full_name: string | null; email: string | null; phone: string | null } | null;
  // derived
  nights: number;
  totalPaid: number;
  outstanding: number;
  settled: boolean;
  guestEmail: string | null;
  hasGuestAccount: boolean;
  overdue: boolean;
  /** Airport pickup attached to this booking, if any. */
  pickup: DeskPickup | null;
};

export type DeskPickup = {
  id: string;
  status: string;
  fee: number | null;
  guest_landed_at: string | null;
  completed_at: string | null;
  /** Pickup is live and still needs a staff sign-off. */
  needsCompletion: boolean;
};

const SELECT = `
  id, guest_id, unit_id, check_in, check_out, num_guests, state, total_price,
  arrived_at, notes, manual_guest_name, manual_guest_email, manual_guest_phone,
  units(name),
  profiles!bookings_guest_id_profiles_fkey(full_name, email, phone)
`;

export type EmailOutcome = { sent: boolean; reason?: string };

export function useCheckInDesk() {
  const { activePropertyId } = useProperty();
  const today = format(new Date(), "yyyy-MM-dd");
  const horizon = format(addDays(new Date(), 1), "yyyy-MM-dd");

  const bookingsQuery = useQuery({
    queryKey: ["check-in-desk", "bookings", activePropertyId, today],
    queryFn: async () => {
      let q: any = supabase.from("bookings").select(SELECT).in("state", ["confirmed", "checked_in"]);
      if (activePropertyId) q = q.eq("property_id", activePropertyId);
      const { data, error } = await q.order("check_in", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    refetchInterval: 60_000,
  });

  const bookingIds = useMemo(
    () => (bookingsQuery.data ?? []).map((b: any) => b.id),
    [bookingsQuery.data],
  );

  const paymentsQuery = useQuery({
    queryKey: ["check-in-desk", "payments", bookingIds.slice().sort().join(",")],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("booking_id, amount, status, payment_type, refund_amount")
        .in("booking_id", bookingIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const pickupsQuery = useQuery({
    queryKey: ["check-in-desk", "pickups", bookingIds.slice().sort().join(",")],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("airport_pickups")
        .select("id, booking_id, status, fee, guest_landed_at, completed_at, pickup_enabled")
        .in("booking_id", bookingIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const enriched: DeskBooking[] = useMemo(() => {
    const rows = bookingsQuery.data ?? [];
    const pays = paymentsQuery.data ?? [];
    const pickups = pickupsQuery.data ?? [];
    return rows.map((b: any) => {
      const mine = pays.filter((p: any) => p.booking_id === b.id);
      const { totalPaid, outstanding } = calculateOutstanding(
        b.total_price,
        mine.map((p: any) => ({
          amount: Number(p.amount),
          status: p.status,
          payment_type: p.payment_type,
          refund_amount: p.refund_amount,
        })),
      );
      const nights = Math.max(
        0,
        Math.round(
          (new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86400000,
        ),
      );
      const guestEmail = b.profiles?.email ?? b.manual_guest_email ?? null;
      const raw = pickups.find((p: any) => p.booking_id === b.id) ?? null;
      const pickup: DeskPickup | null = raw
        ? {
            id: raw.id,
            status: raw.status,
            fee: raw.fee == null ? null : Number(raw.fee),
            guest_landed_at: raw.guest_landed_at,
            completed_at: raw.completed_at,
            needsCompletion:
              raw.pickup_enabled !== false &&
              !raw.completed_at &&
              !["completed", "cancelled", "declined", "failed"].includes(raw.status ?? ""),
          }
        : null;
      return {
        ...b,
        pickup,
        nights,
        totalPaid,
        outstanding,
        settled: outstanding <= 0,
        guestEmail,
        hasGuestAccount: !!b.guest_id,
        overdue: b.state === "confirmed" ? b.check_in < today : b.check_out < today,
      } as DeskBooking;
    });
  }, [bookingsQuery.data, paymentsQuery.data, pickupsQuery.data, today]);

  const sections = useMemo(() => {
    // Arrivals the desk can act on: confirmed and due today, or overdue.
    const arrivals = enriched
      .filter((b) => b.state === "confirmed" && b.check_in <= horizon)
      .sort((a, b) => a.check_in.localeCompare(b.check_in));
    const departures = enriched
      .filter((b) => b.state === "checked_in")
      .sort((a, b) => a.check_out.localeCompare(b.check_out));
    return {
      arrivals,
      departures,
      dueDepartures: departures.filter((b) => b.check_out <= today),
      unresolvedMoney: [...arrivals, ...departures].filter((b) => !b.settled),
    };
  }, [enriched, horizon, today]);

  return {
    sections,
    isLoading: bookingsQuery.isLoading,
    isError: bookingsQuery.isError,
    refetch: () => {
      bookingsQuery.refetch();
      paymentsQuery.refetch();
      pickupsQuery.refetch();
    },
  };
}

/**
 * Sends the guest lifecycle email for a state and reports what happened.
 * Recipient, language and template data are resolved server-side.
 */
async function sendStateEmail(bookingId: string, state: string): Promise<EmailOutcome> {
  const { data, error } = await supabase.functions.invoke("send-booking-state-email", {
    body: { booking_id: bookingId, state },
  });
  if (error) return { sent: false, reason: error.message };
  const payload = (data ?? {}) as any;
  if (payload.error) return { sent: false, reason: String(payload.error) };
  return { sent: !!payload.sent, reason: payload.reason };
}

/** confirmed → checked_in, with arrival stamp and an awaited welcome email. */
export function useDeskCheckIn() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const transition = useTransitionBookingState();

  return useMutation({
    mutationFn: async ({
      booking,
      note,
    }: {
      booking: DeskBooking;
      note?: string;
    }): Promise<EmailOutcome> => {
      // Stamp physical arrival first so the marker survives even if the guest
      // record already had one.
      if (!booking.arrived_at) {
        const { error } = await supabase
          .from("bookings")
          .update({
            arrived_at: new Date().toISOString(),
            arrived_by: user?.id ?? null,
            arrival_note: note?.trim() || null,
          } as any)
          .eq("id", booking.id);
        if (error) throw error;
      }

      await transition.mutateAsync({
        bookingId: booking.id,
        fromState: "confirmed",
        toState: "checked_in",
        reason: note?.trim() ? `Check-in desk — ${note.trim()}` : "Check-in desk — guest arrived",
        skipEmail: true,
      });

      return await sendStateEmail(booking.id, "checked_in");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["check-in-desk"] });
      qc.invalidateQueries({ queryKey: ["front-desk"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

/** checked_in → completed, with an awaited check-out email. */
export function useDeskCheckOut() {
  const qc = useQueryClient();
  const transition = useTransitionBookingState();

  return useMutation({
    mutationFn: async ({
      booking,
      note,
    }: {
      booking: DeskBooking;
      note?: string;
    }): Promise<EmailOutcome> => {
      await transition.mutateAsync({
        bookingId: booking.id,
        fromState: "checked_in",
        toState: "completed",
        reason: note?.trim()
          ? `Check-out desk — ${note.trim()}`
          : booking.settled
            ? "Check-out desk — stay closed, balance settled"
            : "Check-out desk — stay closed with balance outstanding",
        skipEmail: true,
      });

      return await sendStateEmail(booking.id, "completed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["check-in-desk"] });
      qc.invalidateQueries({ queryKey: ["front-desk"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}
