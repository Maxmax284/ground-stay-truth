import { describe, expect, it } from "vitest";
import { computeResponseRate } from "@/hooks/useDriverResponseRate";
import { remainingPaidReads } from "@/hooks/useFlightBudget";

describe("driver response rate", () => {
  it("is null when no link was opened", () => {
    expect(computeResponseRate(0, 0)).toBeNull();
  });

  it("counts replies against opened links", () => {
    expect(computeResponseRate(4, 1)).toBe(25);
    expect(computeResponseRate(3, 3)).toBe(100);
  });

  it("never exceeds 100 percent", () => {
    expect(computeResponseRate(2, 5)).toBe(100);
  });
});

describe("paid flight read cap", () => {
  it("adds today's grants to the standing cap", () => {
    expect(remainingPaidReads(25, 10, 25)).toBe(10);
  });

  it("never goes negative", () => {
    expect(remainingPaidReads(25, 0, 40)).toBe(0);
  });

  it("ignores nonsense grants", () => {
    expect(remainingPaidReads(25, -5, 5)).toBe(20);
  });
});
