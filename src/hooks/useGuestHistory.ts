import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GuestHistory {
  completedStays: number;
  isReturning: boolean;
}

/**
 * Loyalty counts only genuinely finished stays. A booking that is merely
 * checked_in must never count itself — a first-timer in-house would otherwise
 * show "Returning Guest" and could earn a loyalty discount they haven't earned.
 * Pass `excludeBookingId` so the booking being viewed never counts itself.
 */
export function useGuestHistory(
  guestId: string | null | undefined,
  excludeBookingId?: string | null
) {
  return useQuery<GuestHistory>({
    queryKey: ["guest-history", guestId, excludeBookingId ?? null],
    enabled: !!guestId,
    queryFn: async () => {
      let query = supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("guest_id", guestId!)
        .eq("state", "completed");
      if (excludeBookingId) query = query.neq("id", excludeBookingId);
      const { count, error } = await query;
      if (error) throw error;
      const completedStays = count ?? 0;
      return { completedStays, isReturning: completedStays >= 1 };
    },
  });
}
