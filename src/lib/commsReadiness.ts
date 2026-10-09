/**
 * Pure readiness logic for the read-only "Alert readiness" panel.
 * Never claims something works unless there is evidence; device delivery
 * and practice runs stay "not verified" until a human confirms them.
 */
export type Readiness = {
  auto_escalation_enabled: boolean;
  urgent_requests_enabled: boolean;
  call_number_set: boolean;
  whatsapp_number_set: boolean;
  default_oncall_set: boolean;
  responders_notify: number;
  responders_onsite: number;
  shifts_next_7d: number;
  coverage_now: { source?: string } | null;
  push_devices: number;
  push_staff: number;
  push_devices_failing: number;
  push_accepted_7d: number;
  push_failed_7d: number;
  push_device_gone_7d: number;
  email_sent_7d: number;
  email_failed_7d: number;
  email_suppressed_7d: number;
  open_urgent: number;
  last_test_push_accepted_at: string | null;
  practice_run_verified: boolean;
};

export type CheckState = "ok" | "missing" | "warn" | "unverified" | "off";
export type Check = { id: string; label: string; state: CheckState; detail: string };

/** Push-log statuses. "accepted" = push service took it, not proof the phone showed it. */
export function pushStatusLabel(status: string): string {
  if (status === "accepted" || status === "delivered") return "Accepted by push service";
  if (status === "failed") return "Failed";
  return status;
}

export function readinessChecks(r: Readiness): Check[] {
  const coverage = r.coverage_now?.source ?? "none";
  return [
    {
      id: "call",
      label: "Urgent call number",
      state: r.call_number_set ? "ok" : "missing",
      detail: r.call_number_set ? "Saved." : "Not entered yet.",
    },
    {
      id: "whatsapp",
      label: "WhatsApp number",
      state: r.whatsapp_number_set ? "ok" : "missing",
      detail: r.whatsapp_number_set ? "Saved. Opens a chat, not a call." : "Not entered yet.",
    },
    {
      id: "responders",
      label: "Approved responders",
      state: r.responders_notify > 0 ? "ok" : "missing",
      detail: `${r.responders_notify} can be notified · ${r.responders_onsite} can help on site`,
    },
    {
      id: "coverage",
      label: "Who's covering right now",
      state: coverage === "none" ? "warn" : "ok",
      detail:
        coverage === "roster" ? "A roster shift is active."
        : coverage === "default" ? "Default On-Call is covering."
        : `Nobody. Urgent requests go to managers & admins. ${r.shifts_next_7d} shift${r.shifts_next_7d === 1 ? "" : "s"} in the next 7 days.`,
    },
    {
      id: "push",
      label: "Phones signed up for alerts",
      state: r.push_devices === 0 ? "missing" : r.push_devices_failing > 0 ? "warn" : "ok",
      detail:
        r.push_devices === 0
          ? "No phones. Email is carrying everything."
          : `${r.push_devices} device${r.push_devices === 1 ? "" : "s"} · ${r.push_staff} staff${r.push_devices_failing ? ` · ${r.push_devices_failing} reporting problems` : ""}`,
    },
    {
      id: "push_7d",
      label: "Phone alerts, last 7 days",
      state: r.push_failed_7d > 0 ? "warn" : r.push_accepted_7d > 0 ? "unverified" : "unverified",
      detail: `${r.push_accepted_7d} accepted by push service · ${r.push_failed_7d} failed${r.push_device_gone_7d ? ` (${r.push_device_gone_7d} expired devices)` : ""}. Accepted ≠ seen on the phone.`,
    },
    {
      id: "email_7d",
      label: "Emails, last 7 days",
      state: r.email_failed_7d > 0 ? "warn" : "ok",
      detail: `${r.email_sent_7d} sent · ${r.email_failed_7d} failed · ${r.email_suppressed_7d} held back on purpose`,
    },
    {
      id: "escalation",
      label: "Automatic escalation",
      state: r.auto_escalation_enabled ? "ok" : "off",
      detail: r.auto_escalation_enabled ? "On." : "Off. Stays off until management approves staffing and a practice run passes.",
    },
    {
      id: "test",
      label: "Real-phone practice run",
      state: r.practice_run_verified ? "ok" : "unverified",
      detail: r.last_test_push_accepted_at
        ? `Last test alert accepted ${new Date(r.last_test_push_accepted_at).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })} (Bangkok). Not confirmed on a phone.`
        : "Not verified. No practice run recorded.",
    },
  ];
}

/** Ready to switch on escalation only when every prerequisite has real evidence. */
export function readyToEnableEscalation(r: Readiness): boolean {
  return r.call_number_set && r.responders_notify > 0 && r.push_devices > 0 && r.practice_run_verified;
}

/** Where each setup step is fixed. Missing id = nothing to click (e.g. needs management decision). */
export const FIX_LINKS: Record<string, { to: string; label: string }> = {
  call: { to: "/settings?tab=app", label: "Enter number" },
  whatsapp: { to: "/settings?tab=app", label: "Enter number" },
  responders: { to: "/duty-roster", label: "Approve responders" },
  coverage: { to: "/duty-roster", label: "Add shift or Default On-Call" },
  push: { to: "/settings?tab=profile", label: "Turn on Ops Alerts" },
};

/** Steps still needing action, in setup order. */
export function nextSteps(r: Readiness): Check[] {
  return readinessChecks(r).filter((c) => (c.state === "missing" || c.state === "warn") && FIX_LINKS[c.id]);
}
