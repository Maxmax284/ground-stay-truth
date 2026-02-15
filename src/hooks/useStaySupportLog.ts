import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StaySupportLogEntry {
  id: string;
  booking_id: string;
  request_type: string;
  request_id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  changed_by: string | null;
  changed_by_name?: string | null;
  note: string | null;
  created_at: string;
}

export function useStaySupportLog(bookingId?: string | null) {
  return useQuery({
    queryKey: ["stay-support-log", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stay_support_log")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const userIds = [...new Set((data ?? []).map((l) => l.changed_by).filter(Boolean))] as string[];
      let profileMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);
        profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name ?? "Unknown"]));
      }

      return (data ?? []).map((log) => ({
        ...log,
        changed_by_name: log.changed_by ? (profileMap.get(log.changed_by) ?? null) : null,
      })) as StaySupportLogEntry[];
    },
  });
}
