import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LaundryRequest {
  id: string;
  booking_id: string;
  unit_id: string;
  bag_count: number | null;
  note: string | null;
  status: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

const LAUNDRY_STATUS_ORDER = ["received", "in_progress", "ready_for_pickup", "collected"];

export function useLaundryRequests(bookingId?: string | null) {
  return useQuery({
    queryKey: ["laundry-requests", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("laundry_requests")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as LaundryRequest[];
    },
  });
}

export function useAllLaundryRequests() {
  return useQuery({
    queryKey: ["laundry-requests-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("laundry_requests")
        .select("*, bookings!inner(guest_id, units(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const guestIds = [...new Set((data ?? []).map((r: any) => r.bookings?.guest_id).filter(Boolean))];
      let profileMap = new Map<string, string>();
      if (guestIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", guestIds);
        profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name ?? "Guest"]));
      }

      return (data ?? []).map((r: any) => ({
        ...r,
        unit_name: r.bookings?.units?.name ?? "—",
        guest_name: profileMap.get(r.bookings?.guest_id) ?? "—",
      }));
    },
  });
}

async function logSupportAction(params: {
  booking_id: string;
  request_type: "maintenance" | "laundry";
  request_id: string;
  action: string;
  from_status?: string;
  to_status?: string;
  note?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("stay_support_log").insert({
    ...params,
    changed_by: user?.id ?? null,
  });
}

export function useCreateLaundryRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: {
      booking_id: string;
      unit_id: string;
      bag_count?: number;
      note?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("laundry_requests")
        .insert({ ...req, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;

      await logSupportAction({
        booking_id: req.booking_id,
        request_type: "laundry",
        request_id: data.id,
        action: "created",
        to_status: "received",
      });

      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["laundry-requests", vars.booking_id] });
      qc.invalidateQueries({ queryKey: ["laundry-requests-all"] });
      qc.invalidateQueries({ queryKey: ["stay-support-log"] });
    },
  });
}

export function useAdvanceLaundryStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: string;
      booking_id: string;
      current_status: string;
    }) => {
      const idx = LAUNDRY_STATUS_ORDER.indexOf(params.current_status);
      if (idx < 0 || idx >= LAUNDRY_STATUS_ORDER.length - 1) {
        throw new Error("Cannot advance status further");
      }
      const nextStatus = LAUNDRY_STATUS_ORDER[idx + 1];

      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("laundry_requests")
        .update({ status: nextStatus, updated_by: user?.id ?? null })
        .eq("id", params.id)
        .select()
        .single();
      if (error) throw error;

      await logSupportAction({
        booking_id: params.booking_id,
        request_type: "laundry",
        request_id: params.id,
        action: "status_changed",
        from_status: params.current_status,
        to_status: nextStatus,
      });

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["laundry-requests"] });
      qc.invalidateQueries({ queryKey: ["laundry-requests-all"] });
      qc.invalidateQueries({ queryKey: ["stay-support-log"] });
    },
  });
}

export function getNextLaundryStatus(current: string): string | null {
  const idx = LAUNDRY_STATUS_ORDER.indexOf(current);
  if (idx < 0 || idx >= LAUNDRY_STATUS_ORDER.length - 1) return null;
  return LAUNDRY_STATUS_ORDER[idx + 1];
}
