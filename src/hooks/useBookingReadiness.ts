import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Per-booking guest readiness checklist:
 * opened portal · paid · flight added · ID uploaded · messaged.
 *
 * Read-only signals batched across all visible bookings in one query round
 * each — five small `in (...)` selects, no per-card fan-out.
 */
export interface BookingReadiness {
  openedPortal: boolean;
  paid: boolean;
  flightAdded: boolean;
  idUploaded: boolean;
  messaged: boolean;
}

const EMPTY: BookingReadiness = {
  openedPortal: false,
  paid: false,
  flightAdded: false,
  idUploaded: false,
  messaged: false,
};

export function useBookingReadiness(bookings: Array<{ id: string; guest_id?: string | null }> | undefined) {
  const ids = (bookings ?? []).map((b) => b.id);
  const guestByBooking = new Map((bookings ?? []).map((b) => [b.id, b.guest_id ?? null]));

  return useQuery({
    queryKey: ["booking-readiness", ids.slice().sort().join(",")],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, BookingReadiness>> => {
      const result: Record<string, BookingReadiness> = {};
      for (const id of ids) result[id] = { ...EMPTY };

      const [portal, payments, pickups, docs, messages] = await Promise.all([
        supabase.from("guest_portal_activity").select("booking_id").in("booking_id", ids),
        supabase
          .from("payments")
          .select("booking_id, status")
          .in("booking_id", ids)
          .in("status", ["recorded", "partially_refunded"]),
        supabase.from("airport_pickups").select("booking_id, flight_number").in("booking_id", ids),
        supabase.from("guest_documents").select("booking_id").in("booking_id", ids),
        supabase.from("messages").select("booking_id, sender_id").in("booking_id", ids),
      ]);

      for (const row of portal.data ?? []) {
        if (row.booking_id && result[row.booking_id]) result[row.booking_id].openedPortal = true;
      }
      for (const row of payments.data ?? []) {
        if (row.booking_id && result[row.booking_id]) result[row.booking_id].paid = true;
      }
      for (const row of pickups.data ?? []) {
        if (row.booking_id && result[row.booking_id] && row.flight_number) {
          result[row.booking_id].flightAdded = true;
        }
      }
      for (const row of docs.data ?? []) {
        if (row.booking_id && result[row.booking_id]) result[row.booking_id].idUploaded = true;
      }
      for (const row of messages.data ?? []) {
        // Only guest-sent messages count — staff replies don't signal guest engagement.
        if (row.booking_id && result[row.booking_id] && row.sender_id && row.sender_id === guestByBooking.get(row.booking_id)) {
          result[row.booking_id].messaged = true;
        }
      }

      return result;
    },
  });
}
