/**
 * Front Desk operations hook — aggregates everything the front desk needs
 * in one efficient pass. Reads only; mutations live in dedicated hooks.
 *
 * This is a presentation-layer aggregator. All business rules (state
 * machine, payment math, deposit policy, turnover) live in their
 * existing modules and are NOT duplicated here.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProperty } from "@/hooks/useProperty";
import { format, addDays } from "date-fns";
import { calculateOutstanding } from "@/lib/paymentTypes";
import { toast } from "sonner";

export type FrontDeskBooking = {
  id: string;
  guest_id: string | null;
  unit_id: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  state: string;
  total_price: number | null;
  notes: string | null;
  pre_arrival_status: string | null;
  arrived_at: string | null;
  arrived_by: string | null;
  arrival_note: string | null;
  units: { name: string } | null;
  profiles: { full_name: string | null; email: string | null; phone: string | null } | null;
  manual_guest_name: string | null;
  manual_guest_email: string | null;
  manual_guest_phone: string | null;
  manual_guest_note: string | null;
  // Derived
  outstanding: number;
  totalPaid: number;
  depositPaid: boolean;
  securityDeposit: { status: string; amount_held: number } | null;
  turnover: { status: string } | null;
  docCount: number;
  docTypes: string[];
  nights: number;
  tm30Filed: boolean;
  // Staff markers (presentation only — never affect money owed)
  pay_on_arrival: boolean;
  offline_acknowledgements: Record<string, any> | null;
};

/** One open housekeeping task for today, independent of any booking window. */
export type TodayTask = {
  id: string;
  unit_id: string | null;
  unit_name: string;
  task_type: string | null;
  status: string;
  due_by: string | null;
  notes: string | null;
  booking_in_id: string | null;
  booking_out_id: string | null;
};


const SELECT_BOOKING = `
  id, guest_id, unit_id, check_in, check_out, num_guests, state, total_price,
  notes, pre_arrival_status, arrived_at, arrived_by, arrival_note, arrival_details,
  manual_guest_name, manual_guest_email, manual_guest_phone, manual_guest_note,
  pay_on_arrival, offline_acknowledgements,
  units(name),
  profiles!bookings_guest_id_profiles_fkey(full_name, email, phone)
`;


export function useFrontDeskData() {
  const { activePropertyId } = useProperty();
  const today = format(new Date(), "yyyy-MM-dd");
  const next7 = format(addDays(new Date(), 7), "yyyy-MM-dd");

  // Pull all bookings relevant to the next 14 days plus anything currently checked in.
  // One query, then we slice client-side.
  const bookingsQuery = useQuery({
    queryKey: ["front-desk", "bookings", activePropertyId, today],
    queryFn: async () => {
      let q: any = supabase.from("bookings").select(SELECT_BOOKING);
      if (activePropertyId) q = q.eq("property_id", activePropertyId);
      // Anything checked-in (currently staying) OR with check_in in [today-1, today+14]
      q = q.or(
        `state.eq.checked_in,and(check_in.gte.${today},check_in.lte.${next7})`
      );
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
    refetchInterval: 60_000,
  });

  const bookingIds = useMemo(
    () => (bookingsQuery.data ?? []).map((b) => b.id),
    [bookingsQuery.data]
  );

  const paymentsQuery = useQuery({
    queryKey: ["front-desk", "payments", bookingIds.sort().join(",")],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("booking_id, amount, status, payment_type")
        .in("booking_id", bookingIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const depositsQuery = useQuery({
    queryKey: ["front-desk", "deposits", bookingIds.sort().join(",")],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_deposits")
        .select("booking_id, status, amount_held")
        .in("booking_id", bookingIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const turnoverQuery = useQuery({
    queryKey: ["front-desk", "turnover", bookingIds.sort().join(",")],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("housekeeping_tasks")
        .select("booking_out_id, booking_in_id, status, unit_id")
        .or(
          `booking_out_id.in.(${bookingIds.join(",")}),booking_in_id.in.(${bookingIds.join(",")})`
        );
      if (error) throw error;
      return data ?? [];
    },
  });

  const docsQuery = useQuery({
    queryKey: ["front-desk", "docs", bookingIds.sort().join(",")],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guest_documents")
        .select("booking_id, document_type")
        .in("booking_id", bookingIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Enrich every booking with derived fields
  const enriched: FrontDeskBooking[] = useMemo(() => {
    const rows = bookingsQuery.data ?? [];
    const pays = paymentsQuery.data ?? [];
    const deps = depositsQuery.data ?? [];
    const turns = turnoverQuery.data ?? [];
    const docs = docsQuery.data ?? [];

    return rows.map((b: any) => {
      const myPays = pays.filter((p) => p.booking_id === b.id);
      const { totalPaid, outstanding } = calculateOutstanding(
        b.total_price,
        myPays.map((p: any) => ({ amount: Number(p.amount), status: p.status, payment_type: p.payment_type }))
      );
      const depositPaid = myPays.some(
        (p: any) =>
          (p.payment_type === "deposit" || p.payment_type === "online_deposit") &&
          (p.status === "paid" || p.status === "recorded")
      );
      const dep = deps.find((d: any) => d.booking_id === b.id) ?? null;
      // Turnover linked via booking_out (departure) or booking_in (arrival)
      const turn =
        turns.find((t: any) => t.booking_in_id === b.id) ??
        turns.find((t: any) => t.booking_out_id === b.id) ??
        null;
      const myDocs = docs.filter((d: any) => d.booking_id === b.id);
      const docCount = myDocs.length;
      const docTypes = Array.from(new Set(myDocs.map((d: any) => d.document_type ?? "passport")));
      const nights = Math.max(
        0,
        Math.round(
          (new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86400000,
        ),
      );
      const tm30Filed = !!((b.arrival_details as any)?.tm30?.confirmed_at);
      return {
        ...b,
        outstanding,
        totalPaid,
        depositPaid,
        securityDeposit: dep,
        turnover: turn,
        docCount,
        docTypes,
        nights,
        tm30Filed,
      };
    });

  }, [bookingsQuery.data, paymentsQuery.data, depositsQuery.data, turnoverQuery.data, docsQuery.data]);

  // Slice into sections
  const sections = useMemo(() => {
    const arrivingToday = enriched.filter(
      (b) =>
        b.check_in === today &&
        !b.arrived_at &&
        b.state !== "checked_in" &&
        b.state !== "completed" &&
        b.state !== "cancelled" &&
        b.state !== "no_show"
    );
    const arrivedNotCheckedIn = enriched.filter(
      (b) =>
        !!b.arrived_at &&
        b.state !== "checked_in" &&
        b.state !== "completed" &&
        b.state !== "cancelled" &&
        b.state !== "no_show"
    );
    const currentlyStaying = enriched.filter(
      (b) => b.state === "checked_in" && b.check_out !== today
    );
    const departingToday = enriched.filter(
      (b) => b.state === "checked_in" && b.check_out === today
    );
    const upcoming = enriched.filter(
      (b) =>
        b.check_in > today &&
        b.check_in <= next7 &&
        b.state !== "cancelled" &&
        b.state !== "no_show"
    );
    return { arrivingToday, arrivedNotCheckedIn, currentlyStaying, departingToday, upcoming };
  }, [enriched, today, next7]);

  // ─── Operations Intelligence rollups (read-only, presentation only) ───


  // Real pickup query — bound to today's arrival window
  const pickupsTodayQuery = useQuery({
    queryKey: ["front-desk", "pickups-today", activePropertyId, today],
    queryFn: async () => {
      let q: any = supabase
        .from("airport_pickups")
        .select("id, status, booking_id, arrival_datetime");
      if (activePropertyId) q = q.eq("property_id", activePropertyId);
      // Anything with arrival_datetime today OR linked to a booking checking in today
      q = q.gte("arrival_datetime", `${today}T00:00:00Z`).lt(
        "arrival_datetime",
        `${next7}T00:00:00Z`,
      );
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 120_000,
  });

  const pickupTodayCount = (pickupsTodayQuery.data ?? []).filter((p: any) => {
    const d = p.arrival_datetime?.slice(0, 10);
    return d === today;
  }).length;

  const turnoverPendingCount = (turnoverQuery.data ?? []).filter(
    (t: any) => t.status === "pending" || t.status === "in_progress",
  ).length;

  /**
   * Today's cleaning work, loaded straight from housekeeping_tasks.
   *
   * Deliberately NOT derived from the booking window: once a guest checks out
   * their booking leaves the front-desk slice, and the room still needs a flip.
   * This is the same source the dashboard reads, so the two screens agree.
   */
  const todaysTasksQuery = useQuery({
    queryKey: ["front-desk", "housekeeping-today", activePropertyId, today],
    queryFn: async () => {
      let q: any = supabase
        .from("housekeeping_tasks")
        .select("id, unit_id, status, due_by, notes, booking_in_id, booking_out_id, units(name)")
        .in("status", ["pending", "in_progress"]);
      if (activePropertyId) q = q.eq("property_id", activePropertyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
    refetchInterval: 60_000,
  });

  const todaysTasks: TodayTask[] = useMemo(() => {
    const rows = (todaysTasksQuery.data ?? []) as any[];
    return rows
      .filter((t) => {
        // Open work due today or already overdue. No due date = still open work.
        if (!t.due_by) return true;
        return t.due_by.slice(0, 10) <= today;
      })
      .map((t) => ({
        id: t.id,
        unit_id: t.unit_id ?? null,
        unit_name: t.units?.name ?? "—",
        task_type: t.booking_out_id ? "turnover" : "scheduled",
        status: t.status,
        due_by: t.due_by ?? null,
        notes: t.notes ?? null,
        booking_in_id: t.booking_in_id ?? null,
        booking_out_id: t.booking_out_id ?? null,
      }));
  }, [todaysTasksQuery.data, today]);


  // Per-booking pickup map (read-only)
  const pickupByBooking = useMemo(() => {
    const map = new Map<string, { status: string | null; arrival_datetime: string | null }>();
    (pickupsTodayQuery.data ?? []).forEach((p: any) => {
      if (p.booking_id) map.set(p.booking_id, { status: p.status, arrival_datetime: p.arrival_datetime });
    });
    return map;
  }, [pickupsTodayQuery.data]);

  // Last message per booking (read-only, for comms strip)
  const lastMessagesQuery = useQuery({
    queryKey: ["front-desk", "last-messages", bookingIds.sort().join(",")],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("booking_id, content, sender_id, created_at, read_at")
        .in("booking_id", bookingIds)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const lastMessageByBooking = useMemo(() => {
    const map = new Map<string, { content: string; sender_id: string | null; created_at: string; is_read: boolean | null; from_guest: boolean }>();
    const rows = (lastMessagesQuery.data ?? []) as any[];
    const bookings = bookingsQuery.data ?? [];
    rows.forEach((m) => {
      if (!m.booking_id) return;
      if (map.has(m.booking_id)) return;
      const b = bookings.find((x: any) => x.id === m.booking_id);
      const fromGuest = !!(b && b.guest_id && m.sender_id === b.guest_id);
      map.set(m.booking_id, {
        content: m.content ?? "",
        sender_id: m.sender_id,
        created_at: m.created_at,
        is_read: m.read_at != null,
        from_guest: fromGuest,
      });
    });
    return map;
  }, [lastMessagesQuery.data, bookingsQuery.data]);

  return {
    sections,
    intelligence: {
      todaysPickupCount: pickupTodayCount,
      turnoverPendingCount,
    },
    pickupByBooking,
    lastMessageByBooking,
    isLoading:
      bookingsQuery.isLoading ||
      paymentsQuery.isLoading ||
      depositsQuery.isLoading,
    isError: bookingsQuery.isError,
    refetch: () => {
      bookingsQuery.refetch();
      paymentsQuery.refetch();
      depositsQuery.refetch();
      turnoverQuery.refetch();
      docsQuery.refetch();
      pickupsTodayQuery.refetch();
      lastMessagesQuery.refetch();
    },
  };
}

/** Recent override events for the admin strip. */
export function useRecentOverrides(enabled: boolean) {
  return useQuery({
    queryKey: ["front-desk", "overrides"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_state_log")
        .select("id, booking_id, from_state, to_state, changed_by, reason, created_at, bookings(units(name), manual_guest_name, manual_guest_email, manual_guest_phone, profiles!bookings_guest_id_profiles_fkey(full_name, email))")
        .or(
          "reason.ilike.%[ADMIN OVERRIDE]%,reason.ilike.%[MANAGER DEPOSIT OVERRIDE]%,reason.ilike.%[EARLY CHECK-IN APPROVED]%,reason.ilike.%[ARRIVED]%"
        )
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });
}

/** Mark a guest as physically arrived. Booking state is unchanged. */
export function useMarkArrived() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, note }: { bookingId: string; note?: string }) => {
      const { error } = await supabase
        .from("bookings")
        .update({
          arrived_at: new Date().toISOString(),
          arrived_by: user?.id ?? null,
          arrival_note: note?.trim() || null,
        } as any)
        .eq("id", bookingId);
      if (error) throw error;

      // Audit trail entry — no state change, just a marker
      await supabase.from("booking_state_log").insert({
        booking_id: bookingId,
        from_state: null as any,
        to_state: "confirmed" as any, // marker; actual state untouched
        changed_by: user?.id ?? null,
        reason: `[ARRIVED] Guest marked as physically arrived${note ? ` — ${note}` : ""}`,
      } as any);
    },
    onSuccess: () => {
      toast.success("Guest marked as arrived");
      qc.invalidateQueries({ queryKey: ["front-desk"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to mark arrived"),
  });
}

/** Undo arrival marker (clears arrived_at). */
export function useUnmarkArrived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase
        .from("bookings")
        .update({ arrived_at: null, arrived_by: null, arrival_note: null } as any)
        .eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Arrival marker cleared");
      qc.invalidateQueries({ queryKey: ["front-desk"] });
    },
  });
}
