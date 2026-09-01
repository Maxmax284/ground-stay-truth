/**
 * Active human adjustments on a booking (discounts / surcharges).
 *
 * Read-only: used by the Modify Stay / Upgrade surfaces so staff can see which
 * discounts will be carried forward onto the new price before they commit.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AdjustmentRow } from "@/lib/priceStory";

export function useBookingActiveAdjustments(bookingId: string | null | undefined) {
  return useQuery({
    queryKey: ["booking-adjustments", bookingId, "active"],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_adjustments")
        .select("id, label, adjustment_type, value, value_type, amount_calculated, status, applied_at")
        .eq("booking_id", bookingId as string)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as unknown as AdjustmentRow[];
    },
  });
}
