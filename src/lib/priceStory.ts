/**
 * Price Story — the plain-English receipt behind a booking total.
 *
 * Two very different things can move a booking's price, and until now they
 * looked identical to a manager staring at a number that didn't match the
 * rack rate:
 *
 *   1. POLICY (automatic)  — long-stay tiers and loyalty. Nobody "did" it.
 *   2. HUMAN (discretionary) — an admin/manager applied a discount or
 *      surcharge in `booking_adjustments`. Has an actor, a reason, a time.
 *
 * This module turns both into one explainable story so nothing on screen is a
 * mystery. It is pure: no queries, no React. Callers feed it a fresh quote
 * (from `quoteSegments`) plus the active adjustment rows.
 */
import type { PolicySetting } from "@/hooks/usePolicySettings";
import type { StayQuote } from "@/lib/modifyStay";

export type PriceStoryLineKind = "rack" | "policy" | "human" | "fee" | "total";

export interface PriceStoryLine {
  label: string;
  /** Small print under/next to the label — "9.89%, policy", "Applied by Nikki". */
  detail?: string;
  /** Signed: negative for discounts, positive for surcharges/fees. */
  amount: number;
  kind: PriceStoryLineKind;
}

export interface PriceStory {
  /** What the stay would cost at full published rates, before any discount. */
  rackTotal: number;
  /** Automatic (policy) discount total — long-stay + loyalty. */
  policyDiscount: number;
  /** Discretionary discount total applied by a person. */
  humanDiscount: number;
  /** Discretionary surcharge total applied by a person. */
  humanSurcharge: number;
  /** policyDiscount + humanDiscount. Always a positive magnitude. */
  totalDiscount: number;
  /** What the guest is actually being billed, per fresh math. */
  chargedTotal: number;
  /** The total stored on the booking row (what the balance uses). */
  storedTotal: number | null;
  /** storedTotal − chargedTotal. Non-zero means the row is on stale rates. */
  drift: number;
  hasPolicy: boolean;
  hasHuman: boolean;
  /** Both long-stay AND loyalty landed on the same stay. */
  stacked: boolean;
  lines: PriceStoryLine[];
  /**
   * The "don't be surprised" sentence. This is the whole point of the badge —
   * it states the consequence in words, not numbers.
   */
  consequence: string;
  /** Who/what owns the change — drives the badge colour. */
  origin: "policy" | "human" | "both" | "none";
}

export interface AdjustmentRow {
  id?: string;
  label?: string | null;
  adjustment_type?: string | null;
  value?: number | string | null;
  value_type?: string | null;
  amount_calculated?: number | string | null;
  status?: string | null;
  applied_at?: string | null;
  applied_by?: string | null;
  internal_note?: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function policyNumber(policies: PolicySetting[] | null | undefined, key: string): number {
  const row = policies?.find((p) => p.key === key);
  if (!row) return 0;
  const raw = typeof row.value === "string" ? row.value.replace(/^"|"$/g, "") : row.value;
  return Number(raw) || 0;
}

function policyBool(policies: PolicySetting[] | null | undefined, key: string): boolean {
  const row = policies?.find((p) => p.key === key);
  if (!row) return false;
  const raw = typeof row.value === "string" ? row.value.replace(/^"|"$/g, "") : row.value;
  return String(raw) === "true";
}

/**
 * Cheap, client-side hint used by list rows and calendar bars, where running a
 * full re-quote per booking would be wasteful. Says only "policy discounting is
 * plausible on a stay this long", never an amount.
 */
export function detectPolicyDiscountHint(
  nights: number,
  policies: PolicySetting[] | null | undefined
): { tierLabel: string; percentage: number } | null {
  if (!policies || nights < 7) return null;
  const tiers = [
    { min: 30, pct: policyNumber(policies, "long_stay_30_nights_discount_percentage"), label: "30+ nights" },
    { min: 14, pct: policyNumber(policies, "long_stay_14_nights_discount_percentage"), label: "14+ nights" },
    { min: 7, pct: policyNumber(policies, "long_stay_7_nights_discount_percentage"), label: "7+ nights" },
  ];
  const hit = tiers.find((t) => nights >= t.min && t.pct > 0);
  return hit ? { tierLabel: hit.label, percentage: hit.pct } : null;
}

export function nightsBetweenDates(checkIn?: string | null, checkOut?: string | null): number {
  if (!checkIn || !checkOut) return 0;
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function activeAdjustments(rows: AdjustmentRow[] | null | undefined): AdjustmentRow[] {
  return (rows ?? []).filter((a) => (a.status ?? "active") === "active");
}

/**
 * Build the story. `quote` is a fresh re-quote of the stay's current segments;
 * `adjustments` are the rows from `booking_adjustments` (any status — voided
 * ones are ignored here because they no longer move money).
 */
export function buildPriceStory(input: {
  quote: StayQuote | null | undefined;
  adjustments: AdjustmentRow[] | null | undefined;
  storedTotal: number | null | undefined;
  policies: PolicySetting[] | null | undefined;
  /** Resolves an actor id to a display name for the "Applied by" line. */
  actorName?: (id: string | null | undefined) => string;
}): PriceStory {
  const { quote, adjustments, storedTotal, policies } = input;
  const actorName = input.actorName ?? (() => "staff");

  let longStay = 0;
  let loyalty = 0;
  let longStayPct = 0;
  let loyaltyPct = 0;
  let longStayLabel = "";
  let loyaltyLabel = "";
  let roomSubtotal = 0;
  let extraBeds = 0;

  for (const line of quote?.lines ?? []) {
    const s = line.summary;
    if (!s) continue;
    roomSubtotal += Number(s.subtotal ?? 0);
    extraBeds += Number(s.extraBedTotal ?? 0);
    if (s.longStayDiscount) {
      longStay += Number(s.longStayDiscount.amount ?? 0);
      longStayPct = s.longStayDiscount.percentage;
      longStayLabel = s.longStayDiscount.tierLabel;
    }
    if (s.loyaltyDiscount) {
      loyalty += Number(s.loyaltyDiscount.amount ?? 0);
      loyaltyPct = s.loyaltyDiscount.percentage;
      loyaltyLabel = s.loyaltyDiscount.tierLabel;
    }
  }

  const cleaningFee = Number(quote?.cleaningFee ?? 0);
  const policyDiscount = r2(longStay + loyalty);
  const rackTotal = r2(roomSubtotal + extraBeds + cleaningFee);

  const active = activeAdjustments(adjustments);
  let humanDiscount = 0;
  let humanSurcharge = 0;
  const humanLines: PriceStoryLine[] = [];
  for (const a of active) {
    const amt = Math.abs(Number(a.amount_calculated ?? 0));
    const isDiscount = (a.adjustment_type ?? "discount") === "discount";
    if (isDiscount) humanDiscount += amt;
    else humanSurcharge += amt;
    const valueDetail =
      a.value_type === "percent" ? `${a.value}%` : undefined;
    humanLines.push({
      label: a.label || (isDiscount ? "Discount" : "Surcharge"),
      detail: [valueDetail, `applied by ${actorName(a.applied_by)}`].filter(Boolean).join(" · "),
      amount: isDiscount ? -amt : amt,
      kind: "human",
    });
  }
  humanDiscount = r2(humanDiscount);
  humanSurcharge = r2(humanSurcharge);

  const chargedTotal = r2(rackTotal - policyDiscount - humanDiscount + humanSurcharge);
  const stored = storedTotal == null ? null : r2(Number(storedTotal));
  const drift = stored == null ? 0 : r2(stored - chargedTotal);

  const stacks = policyBool(policies, "loyalty_discount_stacks_with_long_stay");
  const stacked = longStay > 0 && loyalty > 0;

  const lines: PriceStoryLine[] = [];
  if (roomSubtotal > 0) {
    lines.push({
      label: "Room total at published rates",
      detail: quote?.nights ? `${quote.nights} night${quote.nights === 1 ? "" : "s"}` : undefined,
      amount: r2(roomSubtotal),
      kind: "rack",
    });
  }
  if (extraBeds > 0) lines.push({ label: "Extra beds", amount: r2(extraBeds), kind: "fee" });
  if (cleaningFee > 0) lines.push({ label: "Cleaning fee", amount: r2(cleaningFee), kind: "fee" });
  if (longStay > 0) {
    lines.push({
      label: `Long stay ${longStayLabel}`.trim(),
      detail: `${longStayPct}% · automatic policy`,
      amount: -r2(longStay),
      kind: "policy",
    });
  }
  if (loyalty > 0) {
    lines.push({
      label: `Loyalty ${loyaltyLabel}`.trim(),
      detail: `${loyaltyPct}% · automatic policy${stacked ? (stacks ? " · stacked" : "") : ""}`,
      amount: -r2(loyalty),
      kind: "policy",
    });
  }
  lines.push(...humanLines);

  const hasPolicy = policyDiscount > 0;
  const hasHuman = humanDiscount > 0 || humanSurcharge > 0;
  const origin: PriceStory["origin"] =
    hasPolicy && hasHuman ? "both" : hasHuman ? "human" : hasPolicy ? "policy" : "none";

  let consequence: string;
  if (origin === "none") {
    consequence = "No discount on this stay. The total is straight published rates.";
  } else if (origin === "policy") {
    consequence =
      "Applied automatically by policy — nobody overrode anything. Outstanding is based on the discounted total, so comparing it to the rack rate will not match.";
  } else if (origin === "human") {
    consequence =
      "A person changed this price on purpose. Outstanding reflects the adjusted total — do not compare it to the rack rate.";
  } else {
    consequence =
      "Policy discounts plus a manual adjustment are both on this stay. Outstanding reflects everything below, so it will never match the rack rate.";
  }
  if (stacked) {
    consequence += stacks
      ? " Long-stay and loyalty are both applied because policy allows stacking."
      : " Long-stay and loyalty both qualified; policy applies only the larger one.";
  }

  return {
    rackTotal,
    policyDiscount,
    humanDiscount,
    humanSurcharge,
    totalDiscount: r2(policyDiscount + humanDiscount),
    chargedTotal,
    storedTotal: stored,
    drift,
    hasPolicy,
    hasHuman,
    stacked,
    lines,
    consequence,
    origin,
  };
}
