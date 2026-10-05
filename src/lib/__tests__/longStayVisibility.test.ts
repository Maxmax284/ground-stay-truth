/** Regression: long-stay discount math staff must see before save (Nam's clipboard cases). */
import { describe, it, expect } from "vitest";
import { calculatePricing } from "../pricingCalculator";

const policies: any[] = [
  { key: "long_stay_7_nights_discount_percentage", value: "9.89" },
  { key: "long_stay_14_nights_discount_percentage", value: "9.89" },
  { key: "long_stay_30_nights_discount_percentage", value: "24.35" },
  { key: "loyalty_pricing_enabled", value: "false" },
  { key: "loyalty_2nd_stay_discount_percentage", value: "10" },
  { key: "tax_included", value: "true" },
];
const unit = (base: number) => ({ id: "u", name: "U", base_price: base, weekend_price: null, capacity: 1, pricing_type: "per_room", min_billable_guests: null, cleaning_fee: 0, max_extra_beds: 0, extra_bed_fee: 0, weekly_rate: null, monthly_rate: null }) as any;

describe("long-stay visibility", () => {
  it("Standard Single 3 nights = ฿3,900, no long-stay", () => {
    const r = calculatePricing(unit(1300), "2026-10-06", "2026-10-09", [], undefined, policies);
    expect(r.subtotal).toBe(3900);
    expect(r.longStayDiscount).toBeNull();
    expect(r.total).toBe(3900);
  });
  it("Standard Single 7 nights = ฿9,100 base, −฿899.99, ฿8,200.01", () => {
    const r = calculatePricing(unit(1300), "2026-10-08", "2026-10-15", [], undefined, policies);
    expect(r.subtotal).toBe(9100);
    expect(r.longStayDiscount?.amount).toBe(899.99);
    expect(r.total).toBeCloseTo(8200.01, 2);
  });
  it("Sea View Villa 7 nights = ฿14,000 base, −฿1,384.60", () => {
    const r = calculatePricing(unit(2000), "2026-09-29", "2026-10-06", [], undefined, policies);
    expect(r.subtotal).toBe(14000);
    expect(r.longStayDiscount?.amount).toBe(1384.6);
    expect(r.total).toBeCloseTo(12615.4, 2);
  });
  it("loyalty disabled → zero loyalty even with completed stays", () => {
    const r = calculatePricing(unit(1300), "2026-10-08", "2026-10-15", [], undefined, policies, 3);
    expect(r.loyaltyDiscount).toBeNull();
  });
  it("Keep base rate (long-stay zeroed) = ฿9,100", () => {
    const noLs = policies.map((p) => (p.key.startsWith("long_stay_") ? { ...p, value: "0" } : p));
    const r = calculatePricing(unit(1300), "2026-10-08", "2026-10-15", [], undefined, noLs);
    expect(r.longStayDiscount).toBeNull();
    expect(r.total).toBe(9100);
  });
});
