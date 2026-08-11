/**
 * BUSINESS-CRITICAL — safe executors for AI action drafts.
 *
 * Plan -> Approve -> Execute. Almost every draft the deep-ops agent writes is
 * still carried out by a human. The ONLY category we let Approve apply
 * automatically is housekeeping/task updates: no money, no inventory, no guest
 * messaging, fully reversible by hand.
 *
 * The parser is deliberately strict and fail-closed. If a payload contains a
 * field we do not recognise, or a value outside the allowed set, the draft is
 * NOT executable and falls back to the manual path. Never widen this to
 * payments, bookings, pricing, units, or anything that talks to a guest.
 */
import { supabase } from "@/integrations/supabase/client";
import { HOUSEKEEPING_STATUSES, type HousekeepingStatus } from "@/lib/statusConstants";
import { logOverrideEvent } from "@/lib/overrideAudit";
import type { AIDraft } from "@/hooks/useAIDrafts";

/** Action types whose drafts may be applied automatically on approval. */
export const EXECUTABLE_ACTION_TYPES = [
  "assign_housekeeping",
  "update_housekeeping",
  "complete_housekeeping",
] as const;

/** Payload keys we understand. Anything else makes the draft manual-only. */
const ALLOWED_KEYS = new Set([
  "task_id",
  "status",
  "assigned_to",
  "notes",
  "due_by",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface HousekeepingPatch {
  status?: HousekeepingStatus;
  assigned_to?: string | null;
  notes?: string;
  due_by?: string;
  completed_at?: string | null;
}

export type DraftExecutionPlan =
  | { ok: true; kind: "housekeeping_task"; taskId: string; patch: HousekeepingPatch; describe: string }
  | { ok: false; reason: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Pure, side-effect-free: decide whether a draft can be applied automatically.
 * Returns the exact patch that would be written so the UI can show it first.
 */
export function planDraftExecution(draft: Pick<AIDraft, "action_type" | "payload">): DraftExecutionPlan {
  if (!(EXECUTABLE_ACTION_TYPES as readonly string[]).includes(draft.action_type)) {
    return { ok: false, reason: "This action type is carried out by hand." };
  }
  const payload = draft.payload;
  if (!isPlainObject(payload)) {
    return { ok: false, reason: "No structured details to apply." };
  }

  const unknown = Object.keys(payload).filter((k) => !ALLOWED_KEYS.has(k));
  if (unknown.length > 0) {
    return { ok: false, reason: `Unrecognised details (${unknown.join(", ")}) — apply this one by hand.` };
  }

  const taskId = payload.task_id;
  if (typeof taskId !== "string" || !UUID_RE.test(taskId)) {
    return { ok: false, reason: "No housekeeping task id in the draft." };
  }

  const patch: HousekeepingPatch = {};
  const parts: string[] = [];

  if (payload.status !== undefined) {
    const status = payload.status;
    if (typeof status !== "string" || !(HOUSEKEEPING_STATUSES as readonly string[]).includes(status)) {
      return { ok: false, reason: "Unknown task status." };
    }
    patch.status = status as HousekeepingStatus;
    patch.completed_at = status === "completed" ? new Date().toISOString() : null;
    parts.push(`status → ${status}`);
  }

  if (payload.assigned_to !== undefined) {
    const assignee = payload.assigned_to;
    if (assignee === null) {
      patch.assigned_to = null;
      parts.push("unassign");
    } else if (typeof assignee === "string" && UUID_RE.test(assignee)) {
      patch.assigned_to = assignee;
      parts.push("reassign");
    } else {
      return { ok: false, reason: "Assignee is not a valid staff id." };
    }
  }

  if (payload.notes !== undefined) {
    const notes = payload.notes;
    if (typeof notes !== "string" || notes.length > 1000) {
      return { ok: false, reason: "Note is missing or too long." };
    }
    patch.notes = notes;
    parts.push("update notes");
  }

  if (payload.due_by !== undefined) {
    const dueBy = payload.due_by;
    if (typeof dueBy !== "string" || Number.isNaN(Date.parse(dueBy))) {
      return { ok: false, reason: "Due time is not a valid date." };
    }
    patch.due_by = new Date(dueBy).toISOString();
    parts.push("change due time");
  }

  if (parts.length === 0) {
    return { ok: false, reason: "Nothing concrete to change." };
  }

  return {
    ok: true,
    kind: "housekeeping_task",
    taskId,
    patch,
    describe: `Housekeeping task: ${parts.join(", ")}`,
  };
}

export function isDraftAutoApplicable(draft: Pick<AIDraft, "action_type" | "payload">): boolean {
  return planDraftExecution(draft).ok;
}

/**
 * Apply an approved draft. RLS still decides: the write only lands for staff
 * with ops-write. A blocked write returns zero rows with no error, so treat
 * that as a failure and say so instead of silently claiming success.
 */
export async function executeDraft(draft: AIDraft): Promise<{ applied: true; describe: string }> {
  const plan = planDraftExecution(draft);
  if (!plan.ok) throw new Error(plan.reason);

  const { data: before } = await supabase
    .from("housekeeping_tasks")
    .select("id, status, assigned_to, notes, due_by, completed_at")
    .eq("id", plan.taskId)
    .maybeSingle();

  if (!before) {
    throw new Error("That housekeeping task no longer exists.");
  }

  const { data, error } = await supabase
    .from("housekeeping_tasks")
    .update(plan.patch)
    .eq("id", plan.taskId)
    .select("id, status, assigned_to, notes, due_by, completed_at");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("You do not have permission to change that housekeeping task.");
  }

  await logOverrideEvent({
    actionType: "ai_draft_executed",
    targetType: "housekeeping_task",
    targetId: plan.taskId,
    bookingId: draft.booking_id,
    beforeState: before as Record<string, unknown>,
    afterState: data[0] as Record<string, unknown>,
    reason: `Auto-applied approved AI draft: ${draft.summary}`,
    metadata: { draft_id: draft.id, action_type: draft.action_type, change: plan.describe },
  });

  return { applied: true, describe: plan.describe };
}
