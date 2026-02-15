import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MaintenanceRequest {
  id: string;
  booking_id: string;
  unit_id: string;
  category: string;
  description: string;
  photo_url: string | null;
  status: string;
  priority: string;
  created_by: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

export function useMaintenanceRequests(bookingId?: string | null) {
  return useQuery({
    queryKey: ["maintenance-requests", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_requests")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as MaintenanceRequest[];
    },
  });
}

export function useAllMaintenanceRequests(statusFilter?: string[]) {
  return useQuery({
    queryKey: ["maintenance-requests-all", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("maintenance_requests")
        .select("*, bookings!inner(guest_id, units(name), check_in, check_out)")
        .order("created_at", { ascending: false });
      if (statusFilter && statusFilter.length > 0) {
        query = query.in("status", statusFilter);
      }
      const { data, error } = await query;
      if (error) throw error;

      // Resolve guest names
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

export function useOpenMaintenanceCount() {
  return useQuery({
    queryKey: ["maintenance-open-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("maintenance_requests")
        .select("*", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
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

export function useCreateMaintenanceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: {
      booking_id: string;
      unit_id: string;
      category: string;
      description: string;
      photo_url?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("maintenance_requests")
        .insert({ ...req, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;

      await logSupportAction({
        booking_id: req.booking_id,
        request_type: "maintenance",
        request_id: data.id,
        action: "created",
        to_status: "open",
      });

      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["maintenance-requests", vars.booking_id] });
      qc.invalidateQueries({ queryKey: ["maintenance-requests-all"] });
      qc.invalidateQueries({ queryKey: ["maintenance-open-count"] });
      qc.invalidateQueries({ queryKey: ["stay-support-log"] });
    },
  });
}

export function useUpdateMaintenanceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: string;
      booking_id: string;
      from_status: string;
      to_status: string;
      resolution_note?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const updatePayload: any = { status: params.to_status };
      if (params.to_status === "resolved") {
        updatePayload.resolved_by = user?.id ?? null;
        updatePayload.resolution_note = params.resolution_note ?? null;
      }

      const { data, error } = await supabase
        .from("maintenance_requests")
        .update(updatePayload)
        .eq("id", params.id)
        .select()
        .single();
      if (error) throw error;

      await logSupportAction({
        booking_id: params.booking_id,
        request_type: "maintenance",
        request_id: params.id,
        action: params.to_status === "resolved" ? "resolved" : "status_changed",
        from_status: params.from_status,
        to_status: params.to_status,
        note: params.resolution_note,
      });

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance-requests"] });
      qc.invalidateQueries({ queryKey: ["maintenance-requests-all"] });
      qc.invalidateQueries({ queryKey: ["maintenance-open-count"] });
      qc.invalidateQueries({ queryKey: ["stay-support-log"] });
    },
  });
}
