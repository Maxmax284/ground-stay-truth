import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, addDays } from "date-fns";

export interface ArrivalsBoardRow {
  booking_id: string;
  guest_name: string;
  guest_email: string | null;
  unit_name: string | null;
  state: string;
  check_in: string;
  check_out: string;
  total_price: number | null;
  pickup: {
    id: string;
    status: string;
    driver_name: string | null;
    license_plate: string | null;
    guest_landed_at: string | null;
    guest_ready_at: string | null;
    collected_at: string | null;
    confirmed_airport: string | null;
    arrival_datetime: string | null;
    assist_mode: string | null;
  } | null;
  flight: {
    flight_number: string | null;
    flight_status: string | null;
    arrival_iata: string | null;
    scheduled_arrival: string | null;
    estimated_arrival: string | null;
    actual_arrival: string | null;
    delay_minutes: number | null;
    last_checked_at: string | null;
  } | null;
  last_message: {
    content: string;
    created_at: string;
    from_guest: boolean;
  } | null;
  unread_guest_messages: number;
}

/**
 * One read for the admin arrivals board: who is coming in, what their flight is
 * doing, and whether a guest is waiting on a reply. Read-only — every action is
 * still taken on the booking / front-desk surfaces that own it.
 */
export function useArrivalsBoard(daysAhead = 14) {
  return useQuery({
    queryKey: ["arrivals-board", daysAhead],
    refetchInterval: 60_000,
    queryFn: async (): Promise<ArrivalsBoardRow[]> => {
      const from = format(subDays(new Date(), 2), "yyyy-MM-dd");
      const to = format(addDays(new Date(), daysAhead), "yyyy-MM-dd");

      const { data: bookings, error } = await (supabase
        .from("bookings")
        .select(
          "id, state, check_in, check_out, total_price, guest_id, manual_guest_name, manual_guest_email, units(name), profiles:guest_id(full_name, email)"
        )
        .gte("check_out", from)
        .lte("check_in", to)
        .not("state", "in", '("cancelled")')
        .order("check_in", { ascending: true }) as any);
      if (error) throw error;

      const ids = (bookings ?? []).map((b: any) => b.id);
      if (ids.length === 0) return [];

      const [pickupsRes, messagesRes] = await Promise.all([
        (supabase
          .from("airport_pickups")
          .select(
            "id, booking_id, status, guest_landed_at, guest_ready_at, collected_at, confirmed_airport, arrival_datetime, assist_mode, drivers(name, license_plate)"
          )
          .in("booking_id", ids) as any),
        (supabase
          .from("messages")
          .select("id, booking_id, content, created_at, sender_id, is_internal")
          .in("booking_id", ids)
          .eq("is_internal", false)
          .order("created_at", { ascending: false }) as any),
      ]);

      const pickups = (pickupsRes.data ?? []) as any[];
      const messages = (messagesRes.data ?? []) as any[];

      let tracking: any[] = [];
      const pickupIds = pickups.map((p) => p.id);
      if (pickupIds.length > 0) {
        const { data } = await (supabase
          .from("flight_tracking")
          .select(
            "pickup_id, flight_number, flight_status, arrival_iata, scheduled_arrival, estimated_arrival, actual_arrival, delay_minutes, last_checked_at"
          )
          .in("pickup_id", pickupIds) as any);
        tracking = data ?? [];
      }

      const pickupByBooking = new Map(pickups.map((p) => [p.booking_id, p]));
      const trackByPickup = new Map(tracking.map((t) => [t.pickup_id, t]));

      return (bookings ?? []).map((b: any) => {
        const pickup = pickupByBooking.get(b.id) ?? null;
        const track = pickup ? trackByPickup.get(pickup.id) ?? null : null;
        const thread = messages.filter((m) => m.booking_id === b.id);
        const latest = thread[0] ?? null;
        return {
          booking_id: b.id,
          guest_name: b.profiles?.full_name || b.manual_guest_name || "Unnamed guest",
          guest_email: b.profiles?.email || b.manual_guest_email || null,
          unit_name: b.units?.name ?? null,
          state: b.state,
          check_in: b.check_in,
          check_out: b.check_out,
          total_price: b.total_price ?? null,
          pickup: pickup
            ? {
                id: pickup.id,
                status: pickup.status,
                driver_name: pickup.drivers?.name ?? null,
                license_plate: pickup.drivers?.license_plate ?? null,
                guest_landed_at: pickup.guest_landed_at,
                guest_ready_at: pickup.guest_ready_at ?? null,
                collected_at: pickup.collected_at ?? null,
                confirmed_airport: pickup.confirmed_airport,
                arrival_datetime: pickup.arrival_datetime,
                assist_mode: pickup.assist_mode ?? null,
              }
            : null,
          flight: track
            ? {
                flight_number: track.flight_number,
                flight_status: track.flight_status,
                arrival_iata: track.arrival_iata,
                scheduled_arrival: track.scheduled_arrival,
                estimated_arrival: track.estimated_arrival,
                actual_arrival: track.actual_arrival,
                delay_minutes: track.delay_minutes,
                last_checked_at: track.last_checked_at,
              }
            : null,
          last_message: latest
            ? {
                content: latest.content,
                created_at: latest.created_at,
                from_guest: latest.sender_id === b.guest_id,
              }
            : null,
          unread_guest_messages: thread.filter((m) => m.sender_id === b.guest_id).length,
        };
      });
    },
  });
}
