/**
 * Read side of the override audit trail.
 *
 * `useOverrideAuditLog(bookingId)` — every override on one booking, newest first.
 * `useRecentOverrides()`           — platform-wide feed for the Operations Monitor.
 * `useOverrideAttributionHealth()` — how many override events have no actor.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OverrideAuditEntry } from "@/lib/overrideAudit";

const TABLE = "override_audit_log";

export function useOverrideAuditLog(bookingId?: string | null) {
  return useQuery({
    queryKey: ["override-audit", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await (supabase.from(TABLE as any) as any)
        .select("*")
        .eq("booking_id", bookingId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as OverrideAuditEntry[];
    },
  });
}

export function useOverrideAuditForTarget(targetType: string, targetId?: string | null) {
  return useQuery({
    queryKey: ["override-audit-target", targetType, targetId],
    enabled: !!targetId,
    queryFn: async () => {
      const { data, error } = await (supabase.from(TABLE as any) as any)
        .select("*")
        .eq("target_type", targetType)
        .eq("target_id", targetId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as OverrideAuditEntry[];
    },
  });
}

export function useRecentOverrides(hours = 168) {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  return useQuery({
    queryKey: ["override-audit-recent", hours],
    queryFn: async () => {
      const { data, error } = await (supabase.from(TABLE as any) as any)
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as OverrideAuditEntry[];
    },
    refetchInterval: 60_000,
  });
}

/** Count of override events we could not attribute to anybody. */
export function useOverrideAttributionHealth() {
  return useQuery({
    queryKey: ["override-attribution-health"],
    queryFn: async () => {
      const { count, error } = await (supabase.from(TABLE as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("attribution_missing", true);
      if (error) throw error;
      return { missing: count ?? 0 };
    },
    refetchInterval: 5 * 60_000,
  });
}
