import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VantaSession {
  id: string;
  platform_key: string;
  platform_name: string;
  environment: "sandbox" | "production";
  vanta_webhook_url: string | null;
  source_id: string;
  enabled: boolean;
  status: string;
  shared_secret_configured: boolean;
  callback_mode: string;
  allowed_events: string[];
  last_event_sent_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_count: number;
  last_error_summary: string | null;
}

export interface VantaLogRow {
  id: string;
  event_id: string;
  event_type: string;
  status: string;
  payload_summary: Record<string, unknown>;
  sent_at: string | null;
  retry_count: number;
  vanta_response_code: number | null;
  error_summary: string | null;
  created_at: string;
}

export function useVantaSession() {
  return useQuery<VantaSession | null>({
    queryKey: ["vanta-session"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vanta_integration_session" as any)
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as VantaSession | null;
    },
  });
}

export function useUpdateVantaSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<VantaSession>) => {
      const { data: existing } = await supabase
        .from("vanta_integration_session" as any)
        .select("id")
        .limit(1)
        .maybeSingle();
      if (!existing) throw new Error("No session row");
      const { error } = await supabase
        .from("vanta_integration_session" as any)
        .update(patch as any)
        .eq("id", (existing as any).id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vanta-session"] }),
  });
}

export function useVantaEventLog(limit = 50) {
  return useQuery<VantaLogRow[]>({
    queryKey: ["vanta-event-log", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vanta_event_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as VantaLogRow[];
    },
    refetchInterval: 15_000,
  });
}

export function useSendVantaTestEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("vanta-test-event", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vanta-event-log"] });
      qc.invalidateQueries({ queryKey: ["vanta-session"] });
    },
  });
}
