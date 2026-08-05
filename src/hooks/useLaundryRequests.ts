import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createNotification, createNotifications } from "@/hooks/useNotifications";
import { useProperty } from "@/hooks/useProperty";
import { logOverrideEvent } from "@/lib/overrideAudit";

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
  const { activePropertyId } = useProperty();
  return useQuery({
    queryKey: ["laundry-requests-all", activePropertyId],
    queryFn: async () => {
      let query = supabase
        .from("laundry_requests")
        .select("*, bookings!inner(guest_id, units(name))")
        .order("created_at", { ascending: false });
      if (activePropertyId) query = query.eq("property_id", activePropertyId);
      const { data, error } = await query;
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

      // Notify staff about new laundry request
      const { data: staff } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "manager", "front_desk", "front_desk_supervisor"]);
      await createNotifications(
        (staff ?? [])
          .filter((s) => s.user_id !== user?.id)
          .map((s) => ({
            user_id: s.user_id,
            type: "laundry",
            reference_id: data.id,
            message: `New laundry request submitted (${req.bag_count ?? 1} bag${(req.bag_count ?? 1) > 1 ? "s" : ""})`,
          }))
      );

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

      // Notify guest when laundry is ready for pickup
      if (nextStatus === "ready_for_pickup") {
        const { data: booking } = await supabase
          .from("bookings")
          .select("guest_id")
          .eq("id", params.booking_id)
          .single();
        if (booking?.guest_id) {
          await createNotification({
            user_id: booking.guest_id,
            type: "laundry",
            reference_id: params.id,
            message: "Your laundry is ready for pickup!",
          });
        }
      }

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

export function useOverrideLaundryStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: string;
      booking_id: string;
      current_status: string;
      target_status: string;
      reason: string;
    }) => {
      if (!params.reason.trim()) throw new Error("Override reason is required");

      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("laundry_requests")
        .update({ status: params.target_status, updated_by: user?.id ?? null })
        .eq("id", params.id)
        .select()
        .single();
      if (error) throw error;

      await logSupportAction({
        booking_id: params.booking_id,
        request_type: "laundry",
        request_id: params.id,
        action: "status_overridden",
        from_status: params.current_status,
        to_status: params.target_status,
        note: params.reason,
        change_type: "override",
      });

      await logOverrideEvent({
        actionType: "laundry_status_override",
        targetType: "laundry_request",
        targetId: params.id,
        bookingId: params.booking_id,
        beforeState: { status: params.current_status },
        afterState: { status: params.target_status },
        reason: params.reason,
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
          batch.push({ user_id: a.user_id, type: "laundry", reference_id: params.id, message: `Laundry status overridden by ${staffName}. Reason: ${params.reason}` });
        }
      }

      // Notify guest on meaningful final states
      if (["ready_for_pickup", "collected"].includes(params.target_status)) {
        const { data: booking } = await supabase.from("bookings").select("guest_id").eq("id", params.booking_id).single();
        if (booking?.guest_id) {
          batch.push({
            user_id: booking.guest_id, type: "laundry", reference_id: params.id,
            message: params.target_status === "ready_for_pickup" ? "Your laundry is ready for pickup!" : "Your laundry has been collected.",
          });
        }
      }
      await createNotifications(batch);

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["laundry-requests"] });
      qc.invalidateQueries({ queryKey: ["laundry-requests-all"] });
      qc.invalidateQueries({ queryKey: ["stay-support-log"] });
    },
  });
}
