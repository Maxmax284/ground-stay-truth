/** Regression: Modify Stay keeps old receipts and prices only new nights. */
import { describe, it, expect } from "vitest";
import { computeChangeDelta, canFullReprice, quoteSegments, nightsBetween, type DraftSegment } from "../modifyStay";

const policies: any[] = [
  { key: "long_stay_7_nights_discount_percentage", value: "9.89" },
  { key: "long_stay_14_nights_discount_percentage", value: "9.89" },
  { key: "long_stay_30_nights_discount_percentage", value: "24.35" },
  { key: "loyalty_pricing_enabled", value: "false" },
  { key: "loyalty_2nd_stay_discount_percentage", value: "10" },
  { key: "tax_included", value: "true" },
];
const mk = (id: string) => ({ id, name: id, base_price: 1300, weekend_price: null, capacity: 1, pricing_type: "per_room", min_billable_guests: null, cleaning_fee: 0, max_extra_beds: 0, extra_bed_fee: 0, weekly_rate: null, monthly_rate: null, is_active: true }) as any;
const units = [mk("r11"), mk("r12")];
const seg = (unit_id: string, starts_on: string, ends_on: string): DraftSegment => ({ key: `${unit_id}${starts_on}`, unit_id, starts_on, ends_on });
const original = [seg("r11", "2026-09-30", "2026-10-08")];
const STORED = 8434.3;
const run = (after: DraftSegment[], before = original, stored = STORED, completed = 0) =>
  computeChangeDelta(before, after, stored, units, [], policies, 1, completed);

describe("Modify Stay preserve pricing", () => {
  it("A: first-time checked-in guest gets no loyalty on the extension", () => {
    const d = run([...original, seg("r12", "2026-10-08", "2026-10-15")], original, STORED, 0);
    expect(d.added[0].line?.summary?.loyaltyDiscount ?? null).toBeNull();
  });

  it("A2: even a stale completed-stay count can't leak loyalty while it's disabled", () => {
    const d = run([...original, seg("r12", "2026-10-08", "2026-10-15")], original, STORED, 3);
    expect(d.delta).toBe(8200.01);
  });

  it("B: Lucrezia extension = ฿8,200.01, merged ฿16,634.31, never ฿17,571.45", () => {
    const d = run([...original, seg("r12", "2026-10-08", "2026-10-15")]);
    expect(d.delta).toBe(8200.01);
    expect(d.mergedTotal).toBe(16634.31);
    expect(d.mergedTotal).not.toBe(17571.45);
    expect(d.keptNights).toBe(8);
  });

  it("B2: same-room extension prices the same", () => {
    const d = run([seg("r11", "2026-09-30", "2026-10-15")]);
    expect(d.delta).toBe(8200.01);
    expect(d.mergedTotal).toBe(16634.31);
  });

  it("C: room-move segments are continuous; Oct 8 counted once; room count doesn't price", () => {
    const after = [...original, seg("r12", "2026-10-08", "2026-10-15")];
    expect(after.reduce((s, x) => s + nightsBetween(x.starts_on, x.ends_on), 0)).toBe(15);
    const d = run(after);
    expect(d.added).toHaveLength(1);
    expect(d.added[0].startsOn).toBe("2026-10-08");
    expect(d.added[0].nights).toBe(7);
    expect(d.removed).toHaveLength(0);
    expect(d.movedTo).toHaveLength(0);
  });

  it("D: 3-night extension = ฿3,900 flat", () => {
    const d = run([...original, seg("r12", "2026-10-08", "2026-10-11")]);
    expect(d.delta).toBe(3900);
    expect(d.added[0].line?.summary?.longStayDiscount ?? null).toBeNull();
  });

  it("E: 7-night leg = ฿9,100 − ฿899.99", () => {
    const q = quoteSegments([seg("r12", "2026-10-08", "2026-10-15")], units, [], policies, 1, 0);
    expect(q.lines[0].summary?.subtotal).toBe(9100);
    expect(q.lines[0].summary?.longStayDiscount?.amount).toBe(899.99);
    expect(q.total).toBe(8200.01);
  });

  it("F: past nights never re-priced; shortening refunds at most the recorded share", () => {
    const same = run(original);
    expect(same.delta).toBe(0);
    expect(same.mergedTotal).toBe(STORED);
    const short = run([seg("r11", "2026-09-30", "2026-10-06")]);
    expect(short.removedCredit).toBeLessThanOrEqual(Math.round((STORED * 2) / 8 * 100) / 100 + 0.01);
    expect(short.mergedTotal).toBeGreaterThan(0);
  });

  it("F2: same-type room swap on same nights costs nothing", () => {
    expect(run([seg("r12", "2026-09-30", "2026-10-08")]).delta).toBe(0);
  });

  it("G: full re-price only for unpaid early-state bookings", () => {
    expect(canFullReprice("inquiry", false)).toBe(true);
    expect(canFullReprice("pending_deposit", false)).toBe(true);
    expect(canFullReprice("pending_deposit", true)).toBe(false);
    expect(canFullReprice("checked_in", false)).toBe(false);
    expect(canFullReprice("confirmed", false)).toBe(false);
  });

  it("H: 1-night add-on to a 35-night stay inherits the 30+ tier", () => {
    const v = { ...mk("v2"), base_price: 2000 };
    const before = [seg("v2", "2026-09-18", "2026-10-23")];
    const d = computeChangeDelta(before, [seg("v2", "2026-09-18", "2026-10-24")], 52955, [v], [], policies, 1, 0);
    expect(d.added[0].line?.summary?.longStayDiscount?.percentage).toBe(24.35);
    expect(d.delta).toBe(1513);
    expect(d.mergedTotal).toBe(54468);
  });

  it("H2: early-arrival night inherits the leg's tier too", () => {
    const v = { ...mk("v2"), base_price: 2000 };
    const d = computeChangeDelta([seg("v2", "2026-09-18", "2026-10-23")], [seg("v2", "2026-09-17", "2026-10-23")], 52955, [v], [], policies, 1, 0);
    expect(d.delta).toBe(1513);
  });

  it("H3: a 1-night add-on in a different room starts its own leg (no inherited tier)", () => {
    const d = run([...original, seg("r12", "2026-10-08", "2026-10-09")]);
    expect(d.delta).toBe(1300);
  });
});
