/**
 * useRecoverySnapshots — admin-only configuration snapshots (DRS extension).
 * Snapshots capture policy_settings, pricing_rules, properties, units, user_roles
 * for forensic comparison & restore-preview. No PII, no payments, no bookings.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface RecoverySnapshot {
  id: string;
  label: string;
  notes: string | null;
  kind: string;
  table_counts: Record<string, number>;
  size_bytes: number;
  created_by_email: string | null;
  created_at: string;
}

export function useRecoverySnapshots() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["recovery-snapshots"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recovery_snapshots")
        .select("id,label,notes,kind,table_counts,size_bytes,created_by_email,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as RecoverySnapshot[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: { label: string; notes?: string }) => {
      const { data, error } = await supabase.rpc("create_recovery_snapshot", {
        _label: input.label,
        _notes: input.notes ?? null,
        _kind: "manual",
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recovery-snapshots"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recovery_snapshots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recovery-snapshots"] }),
  });

  const fetchPayload = async (id: string) => {
    const { data, error } = await supabase
      .from("recovery_snapshots")
      .select("payload")
      .eq("id", id)
      .single();
    if (error) throw error;
    return (data as any)?.payload ?? {};
  };

  return {
    snapshots: list.data ?? [],
    isLoading: list.isLoading,
    create,
    remove,
    fetchPayload,
  };
}
