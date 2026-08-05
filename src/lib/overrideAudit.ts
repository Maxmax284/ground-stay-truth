/**
 * BUSINESS-CRITICAL — override attribution.
 *
 * One rule: every manual override in CampStay must be traceable to the person
 * (or the automation) that performed it. This module is the single write path.
 *
 * Writes go through the `log_override_event` database helper, which resolves
 * the actor server-side from the signed-in session — name, email and job role.
 * The client cannot claim to be somebody else. If nobody can be resolved the
 * row is stored as "Unknown user" with `source = 'unknown'` and
 * `attribution_missing = true` rather than being silently dropped.
 */
import { supabase } from "@/integrations/supabase/client";
import { formatCampShort } from "@/lib/timezone";

export type OverrideSource =
  | "human_admin"
  | "staff_user"
  | "system"
  | "automation"
  | "unknown";

export interface OverrideAuditEntry {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action_type: string;
  target_type: string;
  target_id: string | null;
  booking_id: string | null;
  room_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  reason: string | null;
  source: OverrideSource;
  attribution_missing: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface LogOverrideInput {
  /** Short machine key, e.g. "booking_state_override", "laundry_status_override". */
  actionType: string;
  /** What was overridden: "booking", "payment", "unit", "housekeeping_task", … */
  targetType: string;
  targetId?: string | null;
  bookingId?: string | null;
  roomId?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  reason?: string | null;
  /**
   * Only pass "system" / "automation" for non-human actions. Human overrides
   * leave this undefined so the database derives human_admin vs staff_user
   * from the signed-in user's role.
   */
  source?: Extract<OverrideSource, "system" | "automation">;
  metadata?: Record<string, unknown> | null;
}

/** Job roles in words a human reads. */
export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  front_desk_supervisor: "Front Desk Supervisor",
  front_desk: "Front Desk",
  maintenance: "Maintenance",
  viewer: "Viewer",
  guest: "Guest",
};

export function roleLabel(role: string | null | undefined): string | null {
  if (!role) return null;
  return ROLE_LABELS[role] ?? role.replace(/_/g, " ");
}

/**
 * One-line attribution string for audit/history views.
 *
 *   "Override by Nikki Beale · Admin · Aug 5, 10:42 AM"
 *   "System override · Automation · Aug 5, 10:42 AM"
 *   "Unknown user · Attribution missing"
 */
export function formatOverrideAttribution(
  entry: Pick<
    OverrideAuditEntry,
    "actor_name" | "actor_email" | "actor_role" | "source" | "attribution_missing" | "created_at"
  >,
): string {
  const when = entry.created_at ? formatCampShort(entry.created_at) : "";

  if (entry.attribution_missing || entry.source === "unknown") {
    return "Unknown user · Attribution missing";
  }

  if (entry.source === "system" || entry.source === "automation") {
    const label = entry.source === "system" ? "System" : "Automation";
    return `System override · ${label}${when ? ` · ${when}` : ""}`;
  }

  const who = entry.actor_name?.trim() || entry.actor_email?.trim() || "Unknown user";
  if (who === "Unknown user") return "Unknown user · Attribution missing";

  const role = roleLabel(entry.actor_role);
  return `Override by ${who}${role ? ` · ${role}` : ""}${when ? ` · ${when}` : ""}`;
}

/** Human-readable one-liner about the change itself. */
export function describeOverrideChange(entry: Pick<OverrideAuditEntry, "before_state" | "after_state">): string | null {
  const before = entry.before_state ?? {};
  const after = entry.after_state ?? {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  if (keys.length === 0) return null;
  return keys
    .map((k) => {
      const b = (before as any)[k];
      const a = (after as any)[k];
      const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
      return `${k.replace(/_/g, " ")}: ${fmt(b)} → ${fmt(a)}`;
    })
    .join(" · ");
}

/**
 * Record an override. Never throws — an audit failure must not roll back or
 * block the operational action the staff member just performed, but it is
 * logged loudly to the console so it shows up in monitoring.
 */
export async function logOverrideEvent(input: LogOverrideInput): Promise<string | null> {
  try {
    const { data, error } = await (supabase.rpc as any)("log_override_event", {
      _action_type: input.actionType,
      _target_type: input.targetType,
      _target_id: input.targetId ?? null,
      _booking_id: input.bookingId ?? null,
      _room_id: input.roomId ?? null,
      _before_state: input.beforeState ?? {},
      _after_state: input.afterState ?? {},
      _reason: input.reason ?? null,
      _source: input.source ?? null,
      _metadata: input.metadata ?? {},
    });
    if (error) throw error;
    return (data as string) ?? null;
  } catch (err) {
    console.error("[overrideAudit] Failed to record override attribution", input.actionType, err);
    return null;
  }
}
