import { describe, it, expect } from "vitest";
import {
  ARRIVAL_RETENTION,
  retentionCutoff,
  isEvidenceExpired,
  daysUntilEvidencePurge,
  describeEvidenceRetention,
} from "../arrivalRetention";

const NOW = new Date("2026-09-22T05:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

describe("arrival retention policy", () => {
  it("states finite, specific windows", () => {
    expect(ARRIVAL_RETENTION.evidenceDaysAfterCheckout).toBe(30);
    expect(ARRIVAL_RETENTION.flightFactDays).toBe(90);
    expect(ARRIVAL_RETENTION.resolvedConflictDays).toBe(90);
    expect(ARRIVAL_RETENTION.auditDays).toBe(730);
  });

  it("computes a cutoff in the past", () => {
    expect(retentionCutoff(30, NOW)).toBe(new Date(NOW.getTime() - 30 * DAY).toISOString());
  });

  it("keeps evidence for a stay that ended yesterday", () => {
    expect(isEvidenceExpired(daysAgo(1), NOW)).toBe(false);
  });

  it("keeps evidence on the 30th day and deletes after it", () => {
    expect(isEvidenceExpired(daysAgo(30), NOW)).toBe(false);
    expect(isEvidenceExpired(daysAgo(31), NOW)).toBe(true);
  });

  it("keeps evidence for a future stay", () => {
    expect(isEvidenceExpired(new Date(NOW.getTime() + 10 * DAY).toISOString(), NOW)).toBe(false);
  });

  it("never deletes when the checkout date is unknown or unreadable", () => {
    expect(isEvidenceExpired(null, NOW)).toBe(false);
    expect(isEvidenceExpired(undefined, NOW)).toBe(false);
    expect(isEvidenceExpired("not-a-date", NOW)).toBe(false);
  });

  it("counts down the days left before purge", () => {
    expect(daysUntilEvidencePurge(daysAgo(10), NOW)).toBe(20);
    expect(daysUntilEvidencePurge(daysAgo(40), NOW)).toBe(0);
    expect(daysUntilEvidencePurge(null, NOW)).toBeNull();
  });

  it("explains retention in one plain sentence", () => {
    expect(describeEvidenceRetention()).toBe("Deleted 30 days after checkout.");
  });
});
