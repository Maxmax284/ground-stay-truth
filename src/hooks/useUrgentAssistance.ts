import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AssistanceConfig = {
  urgent_call_number: string | null;
  whatsapp_display_number: string | null;
  staffed_hours_text: string | null;
  after_hours_notice: string | null;
  urgent_requests_enabled: boolean;
};

export const URGENT_CATEGORIES = [
  { value: "locked_out", label: "Locked out" },
  { value: "access", label: "Can't get in / access problem" },
  { value: "medical", label: "Medical" },
  { value: "safety", label: "Safety" },
  { value: "room_problem", label: "Room problem" },
  { value: "other", label: "Something else" },
] as const;

export function useAssistanceConfig() {
  return useQuery({
    queryKey: ["assistance-config"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_guest_assistance_config" as any);
      if (error) throw error;
      return data as unknown as AssistanceConfig;
    },
    staleTime: 60_000,
  });
}

export function useSetAssistanceSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const { error } = await supabase.rpc("set_assistance_setting" as any, { _key: key, _value: value as any });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assistance-config"] }),
  });
}

export function useCreateUrgentRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { bookingId: string; category: string; details?: string }) => {
      const { data, error } = await supabase.rpc("create_urgent_request" as any, {
        _booking_id: p.bookingId, _category: p.category, _details: p.details ?? null,
      });
      if (error) throw error;
      return data as unknown as { id: string; updated_existing: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-urgent-requests"] }),
  });
}

export function useMyOpenUrgentRequest(bookingId?: string | null) {
  return useQuery({
    queryKey: ["my-urgent-requests", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guest_escalations")
        .select("id, status, category, created_at, acknowledged_at")
        .eq("booking_id", bookingId!)
        .eq("kind", "urgent_request")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useOpenUrgentRequests() {
  return useQuery({
    queryKey: ["urgent-requests-open"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guest_escalations")
        .select("id, booking_id, category, details, status, high_volume, created_at, acknowledged_at, acknowledged_by, addressed_at")
        .eq("kind", "urgent_request")
        .eq("resolved", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUrgentRequestAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; action: "acknowledge" | "addressed" | "resolve" | "spam" | "note"; note?: string }) => {
      const { error } = await supabase.rpc("urgent_request_action" as any, { _id: p.id, _action: p.action, _note: p.note ?? null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["urgent-requests-open"] }),
  });
}
