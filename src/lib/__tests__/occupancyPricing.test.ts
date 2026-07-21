/**
 * Occupancy pricing tests — min_billable_guests behavior.
 *
 * Verifies that:
 * - per_room units ignore guest count (flat room rate).
 * - per_person units multiply by billable guests, not capacity.
 * - min_billable_guests floors the multiplier (Twin room: 1 guest still bills 2).
 * - Long-stay discount is applied AFTER occupancy pricing.
 * - Standard single/villa configurations are unchanged.
 */
import { describe, it, expect } from "vitest";
import { calculatePricing } from "../pricingCalculator";

const noRules: any[] = [];
const noPolicies: any[] = [];

// 4-night stay Mon–Fri (2026-01-19 → 2026-01-23) — no weekend nights, keeps math simple.
const CI = "2026-01-19";
const CO = "2026-01-23"; // 4 nights

function unit(over: Record<string, any> = {}) {
  return {
    id: "u",
    name: "Test",
    base_price: 1100,
    weekend_price: null,
    capacity: 2,
    pricing_type: "per_room",
    min_billable_guests: null,
    cleaning_fee: 0,
    max_extra_beds: 0,
    extra_bed_fee: 0,
    weekly_rate: null,
    monthly_rate: null,
    ...over,
  } as any;
}

describe("occupancy pricing — min_billable_guests", () => {
  it("Twin (per_person, min_billable=2): 1 guest bills for 2", () => {
    const p = calculatePricing(
      unit({ pricing_type: "per_person", base_price: 1100, min_billable_guests: 2, capacity: 2 }),
      CI, CO, noRules, undefined, noPolicies, 0, 0, 1,
    );
    expect(p.subtotal).toBe(1100 * 2 * 4); // 8800
    expect(p.total).toBe(8800);
    expect(p.billableGuests).toBe(2);
    expect(p.actualGuests).toBe(1);
  });

  it("Twin (per_person, min_billable=2): 2 guests bills for 2", () => {
    const p = calculatePricing(
      unit({ pricing_type: "per_person", base_price: 1100, min_billable_guests: 2, capacity: 2 }),
      CI, CO, noRules, undefined, noPolicies, 0, 0, 2,
    );
    expect(p.subtotal).toBe(8800);
    expect(p.billableGuests).toBe(2);
  });

  it("Superior Single (per_room, no min): unchanged, flat room rate", () => {
    const p = calculatePricing(
      unit({ pricing_type: "per_room", base_price: 1400, capacity: 1 }),
      CI, CO, noRules, undefined, noPolicies, 0, 0, 1,
    );
    expect(p.subtotal).toBe(1400 * 4);
    expect(p.total).toBe(5600);
  });

  it("Sea View Villa (per_room, capacity 4, no min): unchanged regardless of guests", () => {
    const villa = unit({ base_price: 3000, capacity: 4, pricing_type: "per_room" });
    const oneGuest = calculatePricing(villa, CI, CO, noRules, undefined, noPolicies, 0, 0, 1);
    const fourGuests = calculatePricing(villa, CI, CO, noRules, undefined, noPolicies, 0, 0, 4);
    expect(oneGuest.total).toBe(12000);
    expect(fourGuests.total).toBe(12000);
  });

  it("per_person with no min_billable and no numGuests: floors to 1", () => {
    const p = calculatePricing(
      unit({ pricing_type: "per_person", base_price: 500, capacity: 2 }),
      CI, CO, noRules, undefined, noPolicies, 0, 0,
    );
    expect(p.subtotal).toBe(500 * 4);
  });

  it("Long-stay discount applies AFTER occupancy pricing", () => {
    // 8-night stay to trigger 7+ night tier
    const policies: any[] = [
      { key: "long_stay_7_nights_discount_percentage", value: "10" },
    ];
    const p = calculatePricing(
      unit({ pricing_type: "per_person", base_price: 1100, min_billable_guests: 2, capacity: 2 }),
      "2026-01-19", "2026-01-27", noRules, undefined, policies, 0, 0, 1,
    );
    // 8 nights * 2 billable * 1100 = 17600
    expect(p.subtotal).toBe(17600);
    // 10% off subtotal = 1760
    expect(p.longStayDiscount?.amount).toBe(1760);
    expect(p.total).toBe(17600 - 1760);
  });
});
