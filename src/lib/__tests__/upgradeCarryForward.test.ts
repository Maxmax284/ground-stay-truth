import { describe, it, expect } from "vitest";
import { computeCarryForward } from "@/lib/upgradeCarryForward";

describe("computeCarryForward", () => {
  it("re-applies a percent discount to the new price and suggests the waiver", () => {
    // Nikki's case: 10% returning-customer discount, upgrade adds ฿4,200 base.
    const c = computeCarryForward(
      [{ label: "Returning customer discount", adjustment_type: "discount", value_type: "percent", value: 10, status: "active" }],
      42000,
      46200,
    );
    expect(c.adjustBefore).toBe(-4200);
    expect(c.adjustAfter).toBe(-4620);
    expect(c.baseDelta).toBe(4200);
    expect(c.netDelta).toBe(3780);
    expect(c.suggestedWaiver).toBe(420);
    expect(c.hasPercentCarry).toBe(true);
  });

  it("carries fixed discounts unchanged, so nothing extra is waived", () => {
    const c = computeCarryForward(
      [{ label: "Goodwill", adjustment_type: "discount", value_type: "fixed", value: 500, amount_calculated: 500, status: "active" }],
      10000,
      12000,
    );
    expect(c.adjustAfter).toBe(-500);
    expect(c.netDelta).toBe(2000);
    expect(c.suggestedWaiver).toBe(0);
  });

  it("ignores voided rows and handles no adjustments", () => {
    const c = computeCarryForward(
      [{ label: "Old", adjustment_type: "discount", value_type: "percent", value: 10, status: "voided" }],
      10000,
      11000,
    );
    expect(c.lines).toHaveLength(0);
    expect(c.netDelta).toBe(1000);
    expect(c.suggestedWaiver).toBe(0);
  });

  it("treats surcharges as money owed, not a discount", () => {
    const c = computeCarryForward(
      [{ label: "Extra bed", adjustment_type: "surcharge", value_type: "percent", value: 5, status: "active" }],
      10000,
      20000,
    );
    expect(c.adjustAfter).toBe(1000);
    expect(c.netAfter).toBe(21000);
    expect(c.suggestedWaiver).toBe(0);
  });
});
