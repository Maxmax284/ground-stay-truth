/**
 * Upgrade math — discount carry-forward, shown before commit.
 *
 * When a stay moves to a different (usually pricier) room, the server re-quotes
 * the stay and re-applies any active human `booking_adjustments` to the NEW
 * base price (percent discounts recalculate, fixed ones carry as-is). That
 * happens automatically inside `modify-stay`.
 *
 * The trap this file exists to close: staff used to hand-waive "10% of the
 * upgrade difference" on top of that automatic re-application, discounting the
 * upgrade twice. So we compute, client-side and deterministically, exactly what
 * the carry-forward is worth on the new price and what the guest actually owes:
 *
 *   netBefore = baseBefore − discounts(baseBefore)
 *   netAfter  = baseAfter  − discounts(baseAfter)
 *   netDelta  = netAfter − netBefore      ← what the guest really owes
 *
 * The server charges on the BASE delta, so the difference between the base
 * delta and the net delta is booked as the waiver. Staff never do that sum.
 */
import type { AdjustmentRow } from "@/lib/priceStory";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface CarryForwardLine {
  label: string;
  /** "percent" | "fixed" */
  valueType: string;
  value: number;
  /** Signed against the guest: negative = discount, positive = surcharge. */
  amountBefore: number;
  amountAfter: number;
}

export interface CarryForward {
  lines: CarryForwardLine[];
  /** Signed sum on the old base price. */
  adjustBefore: number;
  /** Signed sum re-applied to the new base price. */
  adjustAfter: number;
  netBefore: number;
  netAfter: number;
  /** baseAfter − baseBefore (what the server charges before any waiver). */
  baseDelta: number;
  /** What the guest genuinely owes once discounts re-apply. */
  netDelta: number;
  /** Amount to waive so the collected figure equals `netDelta`. Never negative. */
  suggestedWaiver: number;
  hasPercentCarry: boolean;
}

function signedAmount(row: AdjustmentRow, base: number): number {
  const type = String(row.adjustment_type ?? "discount");
  const sign = type === "surcharge" ? 1 : -1;
  const valueType = String(row.value_type ?? "fixed");
  const value = Number(row.value ?? 0) || 0;
  const magnitude =
    valueType === "percent"
      ? r2((base * value) / 100)
      : Math.abs(Number(row.amount_calculated ?? value) || 0);
  return sign * magnitude;
}

export function computeCarryForward(
  adjustments: AdjustmentRow[] | null | undefined,
  baseBefore: number,
  baseAfter: number,
): CarryForward {
  const active = (adjustments ?? []).filter((a) => (a.status ?? "active") === "active");

  const lines: CarryForwardLine[] = active.map((a) => ({
    label: String(a.label ?? "Adjustment"),
    valueType: String(a.value_type ?? "fixed"),
    value: Number(a.value ?? 0) || 0,
    amountBefore: signedAmount(a, baseBefore),
    amountAfter: signedAmount(a, baseAfter),
  }));

  const adjustBefore = r2(lines.reduce((s, l) => s + l.amountBefore, 0));
  const adjustAfter = r2(lines.reduce((s, l) => s + l.amountAfter, 0));
  const netBefore = r2(Math.max(0, baseBefore + adjustBefore));
  const netAfter = r2(Math.max(0, baseAfter + adjustAfter));
  const baseDelta = r2(baseAfter - baseBefore);
  const netDelta = r2(netAfter - netBefore);

  return {
    lines,
    adjustBefore,
    adjustAfter,
    netBefore,
    netAfter,
    baseDelta,
    netDelta,
    suggestedWaiver: r2(Math.max(0, Math.min(baseDelta, baseDelta - netDelta))),
    hasPercentCarry: lines.some((l) => l.valueType === "percent"),
  };
}
