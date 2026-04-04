import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface RecoveryLogEntry {
  id: string;
  created_at: string;
  user_id: string | null;
  user_role: string | null;
  action: string;
  category: string;
  outcome: string;
  details: Record<string, unknown>;
  failure_reason: string | null;
}

export function useRecoveryAuditLog() {
  const { user, role } = useAuth();

  const logsQuery = useQuery({
    queryKey: ["recovery-audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recovery_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as RecoveryLogEntry[];
    },
    enabled: role === "admin",
  });

  const queryClient = useQueryClient();

  const logAction = useMutation({
    mutationFn: async (entry: {
      action: string;
      category: string;
      outcome: string;
      details?: Record<string, string | number | boolean | null>;
      failure_reason?: string;
    }) => {
      const { error } = await supabase.from("recovery_audit_log").insert([{
        user_id: user?.id,
        user_role: role,
        action: entry.action,
        category: entry.category,
        outcome: entry.outcome,
        details: entry.details ?? {},
        failure_reason: entry.failure_reason ?? null,
      }]);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recovery-audit-log"] }),
  });

  return { logs: logsQuery.data ?? [], isLoading: logsQuery.isLoading, logAction };
}
