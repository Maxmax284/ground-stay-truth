import { describe, it, expect } from "vitest";
import { readinessChecks, readyToEnableEscalation, pushStatusLabel, type Readiness } from "../commsReadiness";

const empty: Readiness = {
  auto_escalation_enabled: false, urgent_requests_enabled: false, call_number_set: false,
  whatsapp_number_set: false, default_oncall_set: false, responders_notify: 0, responders_onsite: 0,
  shifts_next_7d: 0, coverage_now: { source: "none" }, push_devices: 0, push_staff: 0,
  push_devices_failing: 0, push_accepted_7d: 0, push_failed_7d: 0, push_device_gone_7d: 0,
  email_sent_7d: 0, email_failed_7d: 0, email_suppressed_7d: 0, open_urgent: 0,
  last_test_push_accepted_at: null, practice_run_verified: false,
};
const byId = (r: Readiness) => Object.fromEntries(readinessChecks(r).map((c) => [c.id, c]));

describe("comms readiness", () => {
  it("today's baseline shows gaps honestly", () => {
    const c = byId(empty);
    expect(c.call.state).toBe("missing");
    expect(c.push.state).toBe("missing");
    expect(c.coverage.state).toBe("warn");
    expect(c.escalation.state).toBe("off");
    expect(c.test.state).toBe("unverified");
  });
  it("accepted push is never shown as verified delivery", () => {
    const c = byId({ ...empty, push_devices: 1, push_staff: 1, push_accepted_7d: 5 });
    expect(c.push_7d.state).toBe("unverified");
    expect(c.push_7d.detail).toContain("Accepted ≠ seen");
    expect(pushStatusLabel("delivered")).toBe("Accepted by push service");
    expect(pushStatusLabel("accepted")).toBe("Accepted by push service");
  });
  it("flags failing/expired devices", () => {
    const c = byId({ ...empty, push_devices: 2, push_devices_failing: 1, push_failed_7d: 2, push_device_gone_7d: 1 });
    expect(c.push.state).toBe("warn");
    expect(c.push_7d.detail).toContain("expired");
  });
  it("escalation gate needs a verified practice run", () => {
    const full = { ...empty, call_number_set: true, responders_notify: 2, push_devices: 2 };
    expect(readyToEnableEscalation(full)).toBe(false);
    expect(readyToEnableEscalation({ ...full, practice_run_verified: true })).toBe(true);
  });
});
