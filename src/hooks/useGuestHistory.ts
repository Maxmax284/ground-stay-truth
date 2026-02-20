import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GuestHistory {
  completedStays: number;
  isReturning: boolean;
}

export function useGuestHistory(guestId: string | null | undefined) {
  return useQuery<GuestHistory>({
    queryKey: ["guest-history", guestId],
    enabled: !!guestId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("guest_id", guestId!)
        .in("state", ["completed", "checked_in"]);
      if (error) throw error;
      const completedStays = count ?? 0;
      return { completedStays, isReturning: completedStays >= 1 };
    },
  });
}
