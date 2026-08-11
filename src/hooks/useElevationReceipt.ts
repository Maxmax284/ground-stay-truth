/**
 * useElevationReceipt — the paper trail for one break-glass window.
 * -----------------------------------------------------------------------------
 * Every audited action taken while an elevation grant is live gets stamped with
 * `elevation_grant_id` by a database trigger. This hook reads those rows back so
 * a window can be closed out with a plain-English receipt: who borrowed admin
 * authority, why, and exactly what they touched.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OverrideAuditEntry } from "@/lib/overrideAudit";

/** Audit rows recorded during one grant, oldest first (reads like a timeline). */
export function useElevationReceipt(grantId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["elevation-receipt", grantId],
    enabled: !!grantId && enabled,
    queryFn: async (): Promise<OverrideAuditEntry[]> => {
      const { data, error } = await supabase
        .from("override_audit_log")
        .select("*")
        .eq("elevation_grant_id", grantId!)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as OverrideAuditEntry[];
    },
  });
}

/** Turn an action key like `booking_state_override` into "Booking state override". */
export function humanizeActionType(actionType: string): string {
  const cleaned = actionType.replace(/_/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
