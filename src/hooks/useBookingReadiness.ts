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

      // Chunk the id list: a single `.in(...)` with hundreds of UUIDs can
      // exceed URL limits and fail silently. Errors are thrown so the row
      // shows nothing instead of falsely marking every step "not done".
      const CHUNK = 50;
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

      const queries = chunks.flatMap((chunk) => [
        supabase.from("guest_portal_activity").select("booking_id").in("booking_id", chunk).limit(10000),
        supabase
          .from("payments")
          .select("booking_id, status")
          .in("booking_id", chunk)
          .in("status", ["recorded", "partially_refunded"])
          .limit(10000),
        supabase.from("airport_pickups").select("booking_id, flight_number").in("booking_id", chunk).limit(10000),
        supabase.from("guest_documents").select("booking_id").in("booking_id", chunk).limit(10000),
        supabase.from("messages").select("booking_id, sender_id").in("booking_id", chunk).limit(10000),
      ]);

      const responses = await Promise.all(queries);
      for (const res of responses) {
        if (res.error) throw res.error;
      }

      // Responses are grouped per chunk in the order the queries were built.
      for (let c = 0; c < chunks.length; c++) {
        const [portal, payments, pickups, docs, messages] = responses.slice(c * 5, c * 5 + 5);

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
      }

      return result;
    },
  });
}
