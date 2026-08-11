/**
 * Staff security audit hook.
 * Wraps the `staff_audit_events` table and the `log_staff_audit_event` RPC.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type StaffAuditSeverity = "info" | "low" | "medium" | "high" | "critical";

export type StaffAuditEventType =
  // MFA
  | "mfa_enabled"
  | "mfa_disabled"
  | "mfa_setup_completed"
  | "mfa_challenge_failed"
  | "mfa_challenge_passed"
  | "mfa_enrollment_started"
  | "mfa_required_by_policy"
  | "mfa_backup_code_used"
  | "mfa_backup_codes_regenerated"
  | "mfa_reset_by_admin"
  | "mfa_trust_created"
  | "mfa_trust_revoked"
  // Step-up
  | "step_up_challenge_passed"
  | "step_up_challenge_failed"
  // Roles & permissions
  | "role_changed"
  | "permission_changed"
  | "staff_invited"
  | "staff_deactivated"
  | "staff_session_revoked"
  // Settings
  | "security_setting_changed"
  | "mfa_policy_changed"
  // Guest portal preview
  | "guest_portal_view_as";

interface LogArgs {
  eventType: StaffAuditEventType;
  severity?: StaffAuditSeverity;
  targetUserId?: string | null;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export function useLogStaffAudit() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventType, severity = "info", targetUserId = null, reason, metadata = {} }: LogArgs) => {
      if (!user) return null;
      const { data, error } = await supabase.rpc("log_staff_audit_event", {
        _event_type: eventType,
        _severity: severity,
        _actor_id: user.id,
        _target_user_id: targetUserId,
        _reason: reason ?? null,
        _metadata: metadata as any,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-audit-events"] });
    },
  });
}

export interface StaffAuditFilters {
  eventTypes?: StaffAuditEventType[];
  severities?: StaffAuditSeverity[];
  actorId?: string;
  search?: string;
  since?: Date | null;
  until?: Date | null;
  limit?: number;
}

export function useStaffAuditEvents(filters: StaffAuditFilters = {}) {
  const { isAdmin, user } = useAuth();
  return useQuery({
    queryKey: ["staff-audit-events", filters],
    enabled: isAdmin || !!user,
    queryFn: async () => {
      let q = supabase
        .from("staff_audit_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(filters.limit ?? 200);

      if (filters.eventTypes?.length) q = q.in("event_type", filters.eventTypes);
      if (filters.severities?.length) q = q.in("severity", filters.severities);
      if (filters.actorId) q = q.eq("actor_id", filters.actorId);
      if (filters.since) q = q.gte("created_at", filters.since.toISOString());
      if (filters.until) q = q.lte("created_at", filters.until.toISOString());

      const { data, error } = await q;
      if (error) throw error;

      const rows = data ?? [];
      if (!filters.search) return rows;
      const needle = filters.search.toLowerCase();
      return rows.filter(
        (r: any) =>
          r.event_type?.toLowerCase().includes(needle) ||
          r.actor_email?.toLowerCase().includes(needle) ||
          r.reason?.toLowerCase().includes(needle)
      );
    },
    refetchInterval: 30_000,
  });
}
