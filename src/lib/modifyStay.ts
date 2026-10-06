/**
 * Modify Stay — pure pricing / diff helpers.
 *
 * A stay is modelled as one or more SEGMENTS (`booking_segments`): each segment
 * is one room held for one continuous date range. A simple stay has exactly one
 * segment; an extension changes its `ends_on`; a room change splits it into two.
 *
 * Everything in this file is deterministic and side-effect free so the numbers
 * shown to staff in the Modify Stay dialog are the same numbers written to
 * `stay_modifications`.
 *
 * Money rules:
 *  - Each segment is priced with the normal pricing cascade (override → season →
 *    weekend → base) via `calculatePricing`.
 *  - The cleaning fee is charged ONCE per stay, not once per segment, so segment
 *    line totals exclude it and it is added back at stay level.
 *  - Long-stay / loyalty tiers are evaluated per segment. Splitting a stay
 *    across rooms can therefore reduce a long-stay tier — that is intentional
 *    and visible in the breakdown rather than silently smoothed over.
 */
import { calculatePricing, type PricingSummary } from "@/lib/pricingCalculator";
import type { Unit } from "@/hooks/useUnits";
import type { PricingRule } from "@/hooks/usePricingRules";
import type { PolicySetting } from "@/hooks/usePolicySettings";

export type ModificationKind =
  | "extend"
  | "shorten"
  | "room_change"
  | "upgrade"
  | "downgrade"
  | "relocation"
  | "combined"
  | "other";

export const MODIFY_REASON_CODES = [
  { code: "guest_request", label: "Guest asked to change" },
  { code: "guest_extension", label: "Guest extending their stay" },
  { code: "early_departure", label: "Guest leaving early" },
  { code: "operational_move", label: "Operational room move" },
  { code: "maintenance", label: "Maintenance / room out of service" },
  { code: "overbooking_fix", label: "Fixing a double booking" },
  { code: "goodwill", label: "Goodwill / service recovery" },
  { code: "staff_correction", label: "Correcting a staff entry error" },
] as const;

export type ModifyReasonCode = (typeof MODIFY_REASON_CODES)[number]["code"];

export interface DraftSegment {
  /** Local row key — not the DB id for newly added legs. */
  key: string;
  id?: string | null;
  unit_id: string;
  starts_on: string;
  ends_on: string;
}

export interface SegmentQuote {
  key: string;
  unitId: string;
  unitName: string;
  startsOn: string;
  endsOn: string;
  nights: number;
  /** Room charge for this leg, cleaning fee excluded. */
  amount: number;
  summary: PricingSummary | null;
  error?: string;
}

export interface StayQuote {
  lines: SegmentQuote[];
  roomTotal: number;
  cleaningFee: number;
  total: number;
  nights: number;
}

export interface DeltaSummary {
  pricingBefore: number;
  pricingAfter: number;
  /** after − before. Positive = guest owes more. */
  calculated: number;
  direction: "charge" | "credit" | "none";
}

const DAY_MS = 86_400_000;

export function nightsBetween(startsOn: string, endsOn: string): number {
  if (!startsOn || !endsOn) return 0;
  const a = Date.parse(`${startsOn}T00:00:00Z`);
  const b = Date.parse(`${endsOn}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / DAY_MS);
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Price a draft set of segments. Unknown units produce a per-line error rather
 * than throwing, so the dialog can render a partial quote and block commit.
 */
export function quoteSegments(
  segments: DraftSegment[],
  units: Unit[],
  pricingRules: PricingRule[],
  policies: PolicySetting[] | null | undefined,
  numGuests: number,
  completedStays: number,
  /** Optional per-segment tier length (same order as segments). */
  tierNights?: number[],
): StayQuote {
  const unitById = new Map(units.map((u) => [u.id, u]));
  const lines: SegmentQuote[] = segments.map((seg, idx) => {
    const unit = unitById.get(seg.unit_id);
    const nights = nightsBetween(seg.starts_on, seg.ends_on);
    if (!unit) {
      return {
        key: seg.key,
        unitId: seg.unit_id,
        unitName: "Unknown room",
        startsOn: seg.starts_on,
        endsOn: seg.ends_on,
        nights,
        amount: 0,
        summary: null,
        error: "Room not found in the active property",
      };
    }
    if (nights <= 0) {
      return {
        key: seg.key,
        unitId: seg.unit_id,
        unitName: unit.name,
        startsOn: seg.starts_on,
        endsOn: seg.ends_on,
        nights: 0,
        amount: 0,
        summary: null,
        error: "Check-out must be after check-in",
      };
    }
    const summary = calculatePricing(
      unit as any,
      seg.starts_on,
      seg.ends_on,
      pricingRules as any,
      null,
      policies as any,
      completedStays,
      0,
      numGuests,
      tierNights?.[idx],
    );
    const cleaning = Number(summary.cleaningFee ?? 0);
    return {
      key: seg.key,
      unitId: seg.unit_id,
      unitName: unit.name,
      startsOn: seg.starts_on,
      endsOn: seg.ends_on,
      nights,
      amount: round2(Number(summary.total ?? 0) - cleaning),
      summary,
    };
  });

  // Cleaning fee: once per stay, taken from the first priced segment's room.
  const firstPriced = lines.find((l) => l.summary);
  const cleaningFee = Number(firstPriced?.summary?.cleaningFee ?? 0);
  const roomTotal = round2(lines.reduce((s, l) => s + l.amount, 0));

  return {
    lines,
    roomTotal,
    cleaningFee,
    total: round2(roomTotal + cleaningFee),
    nights: lines.reduce((s, l) => s + l.nights, 0),
  };
}

export function summarizeDelta(pricingBefore: number, pricingAfter: number): DeltaSummary {
  const calculated = round2(pricingAfter - pricingBefore);
  return {
    pricingBefore: round2(pricingBefore),
    pricingAfter: round2(pricingAfter),
    calculated,
    direction: calculated > 0 ? "charge" : calculated < 0 ? "credit" : "none",
  };
}

/**
 * Describe the shape of the change so the audit trail says "extend" rather than
 * "other". Purely descriptive — it never affects money.
 */
export function inferKind(before: DraftSegment[], after: DraftSegment[]): ModificationKind {
  if (before.length === 0 || after.length === 0) return "other";

  const beforeUnits = new Set(before.map((s) => s.unit_id));
  const afterUnits = new Set(after.map((s) => s.unit_id));
  const sameRooms =
    beforeUnits.size === afterUnits.size && [...beforeUnits].every((u) => afterUnits.has(u));

  const bStart = min(before.map((s) => s.starts_on));
  const bEnd = max(before.map((s) => s.ends_on));
  const aStart = min(after.map((s) => s.starts_on));
  const aEnd = max(after.map((s) => s.ends_on));

  const datesChanged = bStart !== aStart || bEnd !== aEnd;
  const splitChanged = before.length !== after.length;

  if (sameRooms && !splitChanged && datesChanged) {
    if (aStart === bStart && aEnd > bEnd) return "extend";
    if (aStart === bStart && aEnd < bEnd) return "shorten";
    return "relocation";
  }
  if (!sameRooms && !datesChanged) return "room_change";
  if (!sameRooms && datesChanged) return "combined";
  if (splitChanged) return "combined";
  return "other";
}

/**
 * Structural problems the guest/staff must fix before commit. Availability is
 * NOT checked here — only the server may rule on that.
 */
export function validateDraft(segments: DraftSegment[]): string[] {
  const errors: string[] = [];
  if (segments.length === 0) {
    errors.push("A stay needs at least one room leg.");
    return errors;
  }
  segments.forEach((s, i) => {
    if (!s.unit_id) errors.push(`Leg ${i + 1}: pick a room.`);
    if (nightsBetween(s.starts_on, s.ends_on) <= 0) {
      errors.push(`Leg ${i + 1}: check-out must be after check-in.`);
    }
  });
  // Self-overlap on the same room inside one stay is always a data error.
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i];
      const b = segments[j];
      if (a.unit_id && a.unit_id === b.unit_id && rangesOverlap(a.starts_on, a.ends_on, b.starts_on, b.ends_on)) {
        errors.push(`Legs ${i + 1} and ${j + 1} book the same room on overlapping nights.`);
      }
    }
  }
  return errors;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function min(values: string[]): string {
  return values.slice().sort()[0] ?? "";
}

function max(values: string[]): string {
  return values.slice().sort().reverse()[0] ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Preserve-history pricing ("old receipts stay old receipts").
//
// On a live booking the stored total is the receipt for nights already sold.
// Re-quoting those nights under today's policy and overwriting the total would
// claw back (or hand out) money on settled nights. Instead we diff the stay
// night-by-night:
//   kept    — same room, same night in both plans → untouched, no money moves
//   added   — night only in the new plan          → priced fresh, current policy
//   removed — night only in the old plan          → refunded at the lesser of
//             today's price and its pro-rata share of the stored total
//   moved   — same night, different room          → today's rate difference only
// Added/moved runs are priced as their own contiguous legs, so long-stay tiers
// apply per leg (the existing rule) and the cleaning fee is never re-charged.
// ─────────────────────────────────────────────────────────────────────────────

export type PricingMode = "preserve" | "full_reprice";

/** States where nothing has been sold yet, so a full re-quote is honest. */
export const FULL_REPRICE_STATES = ["inquiry", "soft_hold", "pending_approval", "pending_deposit"];

export function canFullReprice(state: string, hasRecordedPayment: boolean): boolean {
  return FULL_REPRICE_STATES.includes(state) && !hasRecordedPayment;
}

export interface ChangeRun {
  unitId: string;
  startsOn: string;
  endsOn: string;
  nights: number;
  amount: number;
  line: SegmentQuote | null;
}

export interface ChangeDelta {
  keptNights: number;
  added: ChangeRun[];
  removed: ChangeRun[];
  movedFrom: ChangeRun[];
  movedTo: ChangeRun[];
  addedAmount: number;
  removedCredit: number;
  movedDifference: number;
  /** Signed: positive = guest owes more. */
  delta: number;
  onRecordTotal: number;
  /** onRecordTotal + delta, never below zero. */
  mergedTotal: number;
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** night (YYYY-MM-DD of the evening) → unit id. Half-open: check-out night excluded. */
function nightMap(segs: DraftSegment[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of segs) {
    const n = nightsBetween(s.starts_on, s.ends_on);
    for (let i = 0; i < n; i++) m.set(addDaysIso(s.starts_on, i), s.unit_id);
  }
  return m;
}

/** Group (night, unit) pairs into contiguous same-room runs. */
function toRuns(nights: Array<[string, string]>): DraftSegment[] {
  const sorted = nights.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const runs: DraftSegment[] = [];
  for (const [night, unit] of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.unit_id === unit && last.ends_on === night) {
      last.ends_on = addDaysIso(night, 1);
    } else {
      runs.push({ key: `run-${runs.length}`, unit_id: unit, starts_on: night, ends_on: addDaysIso(night, 1) });
    }
  }
  return runs;
}

export function computeChangeDelta(
  before: DraftSegment[],
  after: DraftSegment[],
  onRecordTotal: number,
  units: Unit[],
  pricingRules: PricingRule[],
  policies: PolicySetting[] | null | undefined,
  numGuests: number,
  completedStays: number,
): ChangeDelta {
  const b = nightMap(before);
  const a = nightMap(after);
  const added: Array<[string, string]> = [];
  const removed: Array<[string, string]> = [];
  const movedFrom: Array<[string, string]> = [];
  const movedTo: Array<[string, string]> = [];
  let kept = 0;
  for (const [night, unit] of a) {
    const old = b.get(night);
    if (old === undefined) added.push([night, unit]);
    else if (old === unit) kept++;
    else { movedFrom.push([night, old]); movedTo.push([night, unit]); }
  }
  for (const [night, unit] of b) if (!a.has(night)) removed.push([night, unit]);

  // Long-stay tier for a changed slice comes from the full same-room leg it
  // belongs to in its plan, so a 1-night add-on to a 35-night stay keeps 30+.
  const legLength = (plan: Map<string, string>, r: DraftSegment): number => {
    let n = nightsBetween(r.starts_on, r.ends_on);
    let d = addDaysIso(r.starts_on, -1);
    while (plan.get(d) === r.unit_id) { n++; d = addDaysIso(d, -1); }
    d = r.ends_on;
    while (plan.get(d) === r.unit_id) { n++; d = addDaysIso(d, 1); }
    return n;
  };
  const price = (pairs: Array<[string, string]>, plan: Map<string, string>): ChangeRun[] => {
    const runs = toRuns(pairs);
    const tiers = runs.map((r) => legLength(plan, r));
    const q = quoteSegments(runs, units, pricingRules, policies, numGuests, completedStays, tiers);
    return runs.map((r, i) => ({
      unitId: r.unit_id, startsOn: r.starts_on, endsOn: r.ends_on,
      nights: nightsBetween(r.starts_on, r.ends_on),
      amount: q.lines[i]?.amount ?? 0,
      line: q.lines[i] ?? null,
    }));
  };

  const addedRuns = price(added, a);
  const removedRuns = price(removed, b);
  const fromRuns = price(movedFrom, b);
  const toRunsP = price(movedTo, a);

  const sum = (rs: ChangeRun[]) => round2(rs.reduce((s, r) => s + r.amount, 0));
  const addedAmount = sum(addedRuns);
  const beforeNights = b.size;
  const share = beforeNights > 0 ? (Math.max(0, onRecordTotal) * removed.length) / beforeNights : 0;
  const removedCredit = round2(Math.min(sum(removedRuns), share));
  const movedDifference = round2(sum(toRunsP) - sum(fromRuns));
  const delta = round2(addedAmount - removedCredit + movedDifference);

  return {
    keptNights: kept,
    added: addedRuns,
    removed: removedRuns,
    movedFrom: fromRuns,
    movedTo: toRunsP,
    addedAmount,
    removedCredit,
    movedDifference,
    delta,
    onRecordTotal: round2(onRecordTotal),
    mergedTotal: Math.max(0, round2(onRecordTotal + delta)),
  };
}
