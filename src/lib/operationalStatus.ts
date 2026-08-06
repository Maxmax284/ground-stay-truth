/**
 * Operational Status Engine — pure presentation helper.
 *
 * Computes an at-a-glance status for a guest from data the system ALREADY has.
 * No new business logic. No mutations. No DB writes. No state machine touches.
 * Reads only the enriched FrontDeskBooking shape returned by useFrontDeskData.
 */
import type { FrontDeskBooking } from "@/hooks/useFrontDesk";
import { format } from "date-fns";
import { isAcknowledged, isMoneyGapMuted, isPayOnArrival } from "@/lib/staffMarkers";

export type OpStatusTone = "green" | "yellow" | "orange" | "red" | "muted";

export interface OpStatus {
  label: string;
  tone: OpStatusTone;
  /** Optional severity for sorting alerts (higher = more urgent) */
  severity: number;
}

const TODAY = () => format(new Date(), "yyyy-MM-dd");

export function computeOperationalStatus(b: FrontDeskBooking): OpStatus {
  const today = TODAY();
  const arrivingToday = b.check_in === today;
  const departingToday = b.check_out === today;
  const moneyMuted = isMoneyGapMuted(b);
  const docsMuted = isAcknowledged(b, "id_document");

  // 🔴 Hard problems first — unless staff already settled the money offline
  if (arrivingToday && !b.depositPaid && !moneyMuted && b.state !== "checked_in") {
    return { label: "Arrival Problem — Deposit Unpaid", tone: "red", severity: 90 };
  }
  if (b.state === "checked_in" && b.outstanding > 0 && departingToday && !moneyMuted) {
    return { label: "Checkout Blocked — Balance Owed", tone: "red", severity: 85 };
  }

  // 🟢 Healthy steady states
  if (b.state === "checked_in" && !departingToday) {
    return { label: "Staying", tone: "green", severity: 5 };
  }
  if (b.state === "checked_in" && departingToday) {
    return { label: "Checking Out Today", tone: "yellow", severity: 30 };
  }

  // 🟡 Arrival flow
  if (arrivingToday && b.arrived_at) {
    return { label: "Arrived — Awaiting Check-In", tone: "yellow", severity: 50 };
  }
  if (arrivingToday) {
    if (b.outstanding > 0 && isPayOnArrival(b)) {
      return { label: "Arriving Today — Paying On Arrival", tone: "yellow", severity: 35 };
    }
    if (b.outstanding > 0 && !moneyMuted) {
      return { label: "Arriving Today — Balance Owed", tone: "orange", severity: 65 };
    }
    if (b.docCount === 0 && !docsMuted) {
      return { label: "Arriving Today — Docs Missing", tone: "orange", severity: 60 };
    }
    return { label: "Arriving Today", tone: "yellow", severity: 40 };
  }

  // 🟠 Pre-arrival risk
  if (b.outstanding > 0 && isPayOnArrival(b) && b.state !== "completed" && b.state !== "cancelled") {
    return { label: "Paying On Arrival", tone: "muted", severity: 8 };
  }
  if (b.outstanding > 0 && !moneyMuted && b.state !== "completed" && b.state !== "cancelled") {
    return { label: "Outstanding Balance", tone: "orange", severity: 55 };
  }
  if (b.docCount === 0 && !docsMuted && (b.state === "confirmed" || b.state === "pending_deposit")) {
    return { label: "Missing Documents", tone: "orange", severity: 45 };
  }

  // Defaults per state
  switch (b.state) {
    case "confirmed":
      return { label: "Ready For Arrival", tone: "green", severity: 10 };
    case "pending_deposit":
      return { label: "Deposit Pending", tone: "orange", severity: 50 };
    case "pending_approval":
      return { label: "Awaiting Approval", tone: "yellow", severity: 35 };
    case "soft_hold":
      return { label: "Soft Hold", tone: "muted", severity: 15 };
    case "inquiry":
      return { label: "Inquiry", tone: "muted", severity: 10 };
    case "completed":
      return { label: "Completed", tone: "muted", severity: 0 };
    case "cancelled":
      return { label: "Cancelled", tone: "muted", severity: 0 };
    case "no_show":
      return { label: "No-Show", tone: "red", severity: 70 };
    default:
      return { label: b.state, tone: "muted", severity: 0 };
  }
}

export const TONE_CLASS: Record<OpStatusTone, string> = {
  green: "bg-success/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30",
  yellow: "bg-warning/15 text-warning-foreground border-warning/40",
  orange: "bg-warning/25 text-warning-foreground border-warning/60",
  red: "bg-destructive/15 text-destructive border-destructive/40",
  muted: "bg-muted text-muted-foreground border-border",
};
