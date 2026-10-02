/**
 * Pricing Clarity — pure helpers that EXPLAIN a booking total. They never
 * change, round or recompute a stored price. Stored totals are the truth.
 */
import type { PriceStory, PriceStoryLine } from "@/lib/priceStory";

export const DEFAULT_LARGE_ADJUSTMENT_THRESHOLD = 10_000;
export const PICKUP_FEE_DEFAULT = 600;

export const DECIMAL_HELPER =
  "This amount has decimals because the automatic long-stay discount is calculated exactly.";
export const PICKUP_HELPER =
  "Not an overpayment — the airport pickup is billed separately from the room.";
export const MANUAL_BADGE_LABEL = "Manual discount applied";
export const LARGE_ADJUSTMENT_LABEL = "Large pricing adjustment recorded";

/** Neutral "who does what" footer. */
export const ROLE_EXPLAINER = [
  "The system calculates automatic discounts (long stay, loyalty).",
  "Admin approves special discounts and waivers.",
  "Front desk records collections.",
  "Guests book through the booking engine.",
];

/** True when a total carries non-zero satang. Never rounds it. */
export function hasDecimals(total: number | null | undefined): boolean {
  if (total == null || !Number.isFinite(Number(total))) return false;
  const cents = Math.round(Number(total) * 100);
  return cents % 100 !== 0;
}

/** Show the decimal helper only when decimals exist AND a percentage policy discount explains them. */
export function decimalExplanation(total: number | null | undefined, hasPercentDiscount: boolean): string | null {
  return hasDecimals(total) && hasPercentDiscount ? DECIMAL_HELPER : null;
}

export function pickupAddonLine(addonTotal: number, fmt: (n: number) => string): string | null {
  if (!addonTotal || addonTotal <= 0) return null;
  return `Airport pickup: ${fmt(addonTotal)} separate add-on`;
}

export const ADDONS_HELPER = "Add-ons are billed separately from the room rate.";

/** The add-on obligations still counting toward the balance — mirrors calculateOutstanding. */
export function liveAddonRows(
  payments: Array<{ payment_type?: string | null; status?: string | null; description?: string | null }>
): Array<{ description?: string | null }> {
  return (payments ?? []).filter(
    (p) =>
      (p.payment_type ?? "") === "addon" &&
      ["pending", "recorded", "partially_refunded", "waived"].includes(p.status ?? "")
  );
}

/** Only claim "airport pickup" when every live add-on row actually is one. */
export function isAllPickupAddons(rows: Array<{ description?: string | null }>): boolean {
  return rows.length > 0 && rows.every((r) => /pickup/i.test(r.description ?? ""));
}

/** Data-driven add-on label: pickup only when the payment rows say pickup, neutral otherwise. */
export function addonLine(
  rows: Array<{ description?: string | null }>,
  addonTotal: number,
  fmt: (n: number) => string
): string | null {
  if (!addonTotal || addonTotal <= 0) return null;
  return isAllPickupAddons(rows)
    ? `Airport pickup: ${fmt(addonTotal)} separate add-on`
    : `Add-ons: ${fmt(addonTotal)} billed separately from the room`;
}

export function addonHelper(rows: Array<{ description?: string | null }>): string {
  return isAllPickupAddons(rows) ? PICKUP_HELPER : ADDONS_HELPER;
}

/** Payments exceed the room total by exactly the add-on amount → explained, not a mismatch. */
export function isExplainedByAddon(paid: number, roomTotal: number, addonTotal: number): boolean {
  if (addonTotal <= 0) return false;
  return Math.abs(paid - roomTotal - addonTotal) < 0.01;
}

export function shouldRaiseLargeAdjustmentAlert(input: {
  amount: number;
  kind: "manual_discount" | "waiver" | "surcharge" | "policy";
  threshold?: number | null;
}): boolean {
  if (input.kind !== "manual_discount" && input.kind !== "waiver") return false;
  const t = Number(input.threshold);
  const threshold = Number.isFinite(t) && t > 0 ? t : DEFAULT_LARGE_ADJUSTMENT_THRESHOLD;
  return Math.abs(Number(input.amount) || 0) >= threshold;
}

export type Audience = "guest" | "staff";

/** Guest view: amounts and plain labels only — no operator, role or internal reason. */
export function linesForAudience(story: PriceStory, audience: Audience): PriceStoryLine[] {
  if (audience === "staff") return story.lines;
  return story.lines.map((l) => {
    if (l.kind === "human") {
      return { label: l.amount < 0 ? "Discount applied" : "Adjustment", amount: l.amount, kind: l.kind };
    }
    if (l.kind === "policy") {
      return { label: l.label, detail: l.detail?.split(" · ")[0], amount: l.amount, kind: l.kind };
    }
    return { label: l.label, detail: l.detail, amount: l.amount, kind: l.kind };
  });
}

/** Future-only preview: what a round tier would produce. Never saved, never applied to existing bookings. */
export function previewLongStay(base: number, pct: number): number {
  return Math.round(base * (1 - pct / 100) * 100) / 100;
}
