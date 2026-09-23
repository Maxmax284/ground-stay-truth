import { describe, it, expect } from "vitest";
import { daysSinceReview, needsReview } from "@/hooks/useLocalRecommendations";

const NOW = new Date("2026-09-23T00:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("island guide review stamps", () => {
  it("reports null when nobody has ever checked the entry", () => {
    expect(daysSinceReview({ last_reviewed_at: null })).toBeNull();
  });

  it("counts whole days since the last human check", () => {
    expect(daysSinceReview({ last_reviewed_at: daysAgo(10) }, NOW)).toBe(10);
  });

  it("treats a never-checked entry as needing review", () => {
    expect(needsReview({ last_reviewed_at: null }, NOW)).toBe(true);
  });

  it("leaves a recently checked entry alone", () => {
    expect(needsReview({ last_reviewed_at: daysAgo(30) }, NOW)).toBe(false);
  });

  it("flags an entry past the 90-day window", () => {
    expect(needsReview({ last_reviewed_at: daysAgo(120) }, NOW)).toBe(true);
  });

  it("ignores an unparseable timestamp rather than guessing", () => {
    expect(daysSinceReview({ last_reviewed_at: "not-a-date" }, NOW)).toBeNull();
  });
});
