import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ACTIVE_STATES } from "@/lib/bookingStateMachine";

export function useDashboardStats() {
  const today = format(new Date(), "yyyy-MM-dd");

  const arrivals = useQuery({
    queryKey: ["dashboard", "arrivals", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, unit_id, num_guests, state, units(name)")
        .eq("check_in", today)
        .in("state", ["confirmed", "pending_deposit"]);
      if (error) throw error;
      return data;
    },
  });

  const departures = useQuery({
    queryKey: ["dashboard", "departures", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, unit_id, num_guests, state, units(name)")
        .eq("check_out", today)
        .eq("state", "checked_in");
      if (error) throw error;
      return data;
    },
  });

  const activeBookings = useQuery({
    queryKey: ["dashboard", "active"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .in("state", ACTIVE_STATES);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const unitCount = useQuery({
    queryKey: ["dashboard", "units"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("units")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const recentActivity = useQuery({
    queryKey: ["dashboard", "activity"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_state_log")
        .select("*, bookings(unit_id, units(name))")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  return { arrivals, departures, activeBookings, unitCount, recentActivity };
}
