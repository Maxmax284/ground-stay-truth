import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PaymentSummary } from "@/components/CalendarGrid";

/**
 * Fetches payment totals for all bookings within a date range.
 * Returns an array of { booking_id, total_paid }.
 */
export function useCalendarPayments(bookingIds: string[]) {
  return useQuery({
    queryKey: ["calendar-payments", bookingIds],
    enabled: bookingIds.length > 0,
    queryFn: async () => {
      // Fetch all payments for the visible bookings
      const { data, error } = await supabase
        .from("payments")
        .select("booking_id, amount")
        .in("booking_id", bookingIds)
        .eq("status", "recorded");
      if (error) throw error;

      // Aggregate by booking_id
      const map = new Map<string, number>();
      for (const p of data ?? []) {
        map.set(p.booking_id, (map.get(p.booking_id) ?? 0) + Number(p.amount));
      }

      const result: PaymentSummary[] = [];
      for (const [booking_id, total_paid] of map) {
        result.push({ booking_id, total_paid });
      }
      return result;
    },
  });
}
