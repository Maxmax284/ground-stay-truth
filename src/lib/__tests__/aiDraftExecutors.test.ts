import { describe, expect, it } from "vitest";
import { planDraftExecution, isDraftAutoApplicable } from "@/lib/aiDraftExecutors";

const base = { action_type: "assign_housekeeping" } as const;
const TASK = "11111111-2222-3333-4444-555555555555";
const USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("planDraftExecution", () => {
  it("applies a status change", () => {
    const plan = planDraftExecution({ ...base, payload: { task_id: TASK, status: "completed" } });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.taskId).toBe(TASK);
      expect(plan.patch.status).toBe("completed");
      expect(plan.patch.completed_at).toBeTruthy();
    }
  });

  it("clears completed_at when moving off completed", () => {
    const plan = planDraftExecution({ ...base, payload: { task_id: TASK, status: "in_progress" } });
    expect(plan.ok && plan.patch.completed_at).toBeNull();
  });

  it("accepts reassignment and unassignment", () => {
    expect(planDraftExecution({ ...base, payload: { task_id: TASK, assigned_to: USER } }).ok).toBe(true);
    expect(planDraftExecution({ ...base, payload: { task_id: TASK, assigned_to: null } }).ok).toBe(true);
  });

  it("rejects money and booking action types", () => {
    for (const action_type of ["request_payment", "apply_discount", "change_room", "extend_stay", "other"]) {
      expect(isDraftAutoApplicable({ action_type, payload: { task_id: TASK, status: "completed" } })).toBe(false);
    }
  });

  it("fails closed on unrecognised payload keys", () => {
    const plan = planDraftExecution({
      ...base,
      payload: { task_id: TASK, status: "completed", amount: 5000 },
    });
    expect(plan.ok).toBe(false);
  });

  it("rejects bad ids, statuses, dates and oversized notes", () => {
    expect(planDraftExecution({ ...base, payload: { task_id: "nope", status: "completed" } }).ok).toBe(false);
    expect(planDraftExecution({ ...base, payload: { task_id: TASK, status: "cancelled" } }).ok).toBe(false);
    expect(planDraftExecution({ ...base, payload: { task_id: TASK, due_by: "tomorrow" } }).ok).toBe(false);
    expect(planDraftExecution({ ...base, payload: { task_id: TASK, notes: "x".repeat(1001) } }).ok).toBe(false);
    expect(planDraftExecution({ ...base, payload: { task_id: TASK, assigned_to: "bob" } }).ok).toBe(false);
  });

  it("rejects a payload with nothing to change", () => {
    expect(planDraftExecution({ ...base, payload: { task_id: TASK } }).ok).toBe(false);
    expect(planDraftExecution({ ...base, payload: null }).ok).toBe(false);
  });

  it("normalises due_by to an ISO timestamp", () => {
    const plan = planDraftExecution({ ...base, payload: { task_id: TASK, due_by: "2026-08-12T11:00:00+07:00" } });
    expect(plan.ok && plan.patch.due_by).toBe("2026-08-12T04:00:00.000Z");
  });
});
