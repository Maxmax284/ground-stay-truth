import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ACTIVE_STATES } from "@/lib/bookingStateMachine";
import { useProperty } from "@/hooks/useProperty";

export function useDashboardStats() {
  const today = format(new Date(), "yyyy-MM-dd");
  const { activePropertyId } = useProperty();

  const arrivals = useQuery({
    queryKey: ["dashboard", "arrivals", today, activePropertyId],
    queryFn: async () => {
      let query = (supabase
        .from("bookings")
        .select("id, unit_id, num_guests, state, guest_id, units(name), profiles!bookings_guest_id_profiles_fkey(full_name)") as any)
        .eq("check_in", today)
        .in("state", ["confirmed", "pending_deposit"]);
      if (activePropertyId) query = query.eq("property_id", activePropertyId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const departures = useQuery({
    queryKey: ["dashboard", "departures", today, activePropertyId],
    queryFn: async () => {
      let query = (supabase
        .from("bookings")
        .select("id, unit_id, num_guests, state, guest_id, units(name), profiles!bookings_guest_id_profiles_fkey(full_name)") as any)
        .eq("check_out", today)
        .eq("state", "checked_in");
      if (activePropertyId) query = query.eq("property_id", activePropertyId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const activeBookings = useQuery({
    queryKey: ["dashboard", "active", activePropertyId],
    queryFn: async () => {
      let query = supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .in("state", ACTIVE_STATES);
      if (activePropertyId) query = query.eq("property_id", activePropertyId);
      const { count, error } = await query;
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
      // Fetch booking state logs
      const { data: stateLogs, error: stateErr } = await supabase
        .from("booking_state_log")
        .select("*, bookings(unit_id, units(name))")
        .order("created_at", { ascending: false })
        .limit(10);
      if (stateErr) throw stateErr;

      // Fetch recent pickup activity from stay_support_log
      const { data: pickupLogs, error: pickupErr } = await supabase
        .from("stay_support_log")
        .select("*, bookings(unit_id, units(name))")
        .eq("request_type", "airport_pickup")
        .order("created_at", { ascending: false })
        .limit(5);
      if (pickupErr) throw pickupErr;

      // Merge and sort by created_at, take top 12
      const merged = [
        ...(stateLogs ?? []).map((l: any) => ({ ...l, _type: "state" })),
        ...(pickupLogs ?? []).map((l: any) => ({
          ...l,
          _type: "pickup",
          from_state: l.from_status,
          to_state: l.to_status ?? l.action,
          reason: l.note,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
       .slice(0, 12);

      return merged;
    },
  });

  const pendingApproval = useQuery({
    queryKey: ["dashboard", "pendingApproval"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("bookings")
        .select("id, unit_id, check_in, check_out, num_guests, state, guest_id, created_at, units(name), profiles!bookings_guest_id_profiles_fkey(full_name)")
        .eq("state", "pending_approval")
        .order("created_at", { ascending: true })) as any;
      if (error) throw error;
      return data;
    },
  });

  const pendingInquiry = useQuery({
    queryKey: ["dashboard", "pendingInquiry"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("bookings")
        .select("id, unit_id, check_in, check_out, num_guests, state, guest_id, created_at, units(name), profiles!bookings_guest_id_profiles_fkey(full_name)")
        .eq("state", "inquiry")
        .order("created_at", { ascending: true })) as any;
      if (error) throw error;
      return data;
    },
  });

  const inquiryCount = useQuery({
    queryKey: ["dashboard", "inquiryCount"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("state", "inquiry");
      if (error) throw error;
      return count ?? 0;
    },
  });

  return { arrivals, departures, activeBookings, unitCount, recentActivity, pendingApproval, pendingInquiry, inquiryCount };
}
