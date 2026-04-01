import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createNotification, createNotifications } from "@/hooks/useNotifications";
import { useProperty } from "@/hooks/useProperty";

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
  const { activePropertyId } = useProperty();
  return useQuery({
    queryKey: ["maintenance-requests-all", statusFilter, activePropertyId],
    queryFn: async () => {
      let query = supabase
        .from("maintenance_requests")
        .select("*, bookings!inner(guest_id, units(name), check_in, check_out)")
        .order("created_at", { ascending: false });
      if (statusFilter && statusFilter.length > 0) {
        query = query.in("status", statusFilter);
      }
      if (activePropertyId) query = query.eq("property_id", activePropertyId);
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
  const { activePropertyId } = useProperty();
  return useQuery({
    queryKey: ["maintenance-open-count", activePropertyId],
    queryFn: async () => {
      let query = supabase
        .from("maintenance_requests")
        .select("*", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]);
      if (activePropertyId) query = query.eq("property_id", activePropertyId);
      const { count, error } = await query;
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
  change_type?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("stay_support_log").insert({
    booking_id: params.booking_id,
    request_type: params.request_type,
    request_id: params.request_id,
    action: params.action,
    from_status: params.from_status,
    to_status: params.to_status,
    note: params.note,
    change_type: params.change_type ?? "normal",
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

      // Notify maintenance staff + managers
      const { data: staff } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "manager", "maintenance", "front_desk", "front_desk_supervisor"]);
      await createNotifications(
        (staff ?? [])
          .filter((s) => s.user_id !== user?.id)
          .map((s) => ({
            user_id: s.user_id,
            type: "maintenance",
            reference_id: data.id,
            message: `New ${req.category} maintenance request created`,
          }))
      );

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

      // Notify guest on meaningful status changes
      if (["in_progress", "resolved"].includes(params.to_status)) {
        const { data: booking } = await supabase
          .from("bookings")
          .select("guest_id")
          .eq("id", params.booking_id)
          .single();
        if (booking?.guest_id) {
          await createNotification({
            user_id: booking.guest_id,
            type: "maintenance",
            reference_id: params.id,
            message: params.to_status === "in_progress"
              ? "Your maintenance request is being worked on."
              : "Your maintenance request has been resolved.",
          });
        }
      }

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

export function useOverrideMaintenanceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: string;
      booking_id: string;
      current_status: string;
      target_status: string;
      reason: string;
      resolution_note?: string;
    }) => {
      if (!params.reason.trim()) throw new Error("Override reason is required");

      const { data: { user } } = await supabase.auth.getUser();
      const updatePayload: any = { status: params.target_status };
      if (params.target_status === "resolved") {
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
        action: "status_overridden",
        from_status: params.current_status,
        to_status: params.target_status,
        note: params.reason,
        change_type: "override",
      });

      // Notify admins about override
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user?.id ?? "")
        .single();
      const staffName = profile?.full_name ?? "Staff";

      const batch: Array<{ user_id: string; type: string; reference_id: string; message: string }> = [];
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      for (const a of admins ?? []) {
        if (a.user_id !== user?.id) {
          batch.push({ user_id: a.user_id, type: "maintenance", reference_id: params.id, message: `Maintenance status overridden by ${staffName}. Reason: ${params.reason}` });
        }
      }

      // Notify guest on resolution
      if (["in_progress", "resolved"].includes(params.target_status)) {
        const { data: booking } = await supabase.from("bookings").select("guest_id").eq("id", params.booking_id).single();
        if (booking?.guest_id) {
          batch.push({
            user_id: booking.guest_id, type: "maintenance", reference_id: params.id,
            message: params.target_status === "in_progress" ? "Your maintenance request is being worked on." : "Your maintenance request has been resolved.",
          });
        }
      }
      await createNotifications(batch);

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
