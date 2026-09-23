import { describe, it, expect } from "vitest";
import { sortForArrival } from "@/hooks/useLocalRecommendations";
import { daysUntilCheckIn } from "@/components/guest/ArrivalCountdown";

describe("sortForArrival", () => {
  const entry = (name: string, arrival_essential: boolean, sort_order: number) => ({
    name,
    arrival_essential,
    sort_order,
  });

  it("puts first-day essentials ahead of everything else", () => {
    const sorted = sortForArrival([
      entry("beach", false, 1),
      entry("pharmacy", true, 9),
      entry("atm", true, 2),
    ]);
    expect(sorted.map((e) => e.name)).toEqual(["atm", "pharmacy", "beach"]);
  });

  it("keeps the camp's own order within each group", () => {
    const sorted = sortForArrival([entry("b", false, 2), entry("a", false, 1)]);
    expect(sorted.map((e) => e.name)).toEqual(["a", "b"]);
  });

  it("does not mutate the input", () => {
    const input = [entry("b", false, 2), entry("a", true, 1)];
    sortForArrival(input);
    expect(input[0].name).toBe("b");
  });
});

describe("daysUntilCheckIn", () => {
  it("counts calendar days, not elapsed hours", () => {
    expect(daysUntilCheckIn("2026-03-10", new Date("2026-03-08T23:00:00Z"))).toBe(2);
  });

  it("is zero on arrival day", () => {
    expect(daysUntilCheckIn("2026-03-10", new Date("2026-03-10T01:00:00Z"))).toBe(0);
  });

  it("goes negative once the date has passed", () => {
    expect(daysUntilCheckIn("2026-03-10", new Date("2026-03-12T01:00:00Z"))).toBe(-2);
  });
});
