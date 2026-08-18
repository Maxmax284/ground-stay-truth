import { describe, it, expect } from "vitest";
import {
  isBackfillCandidate,
  nextBackfillAction,
  outstandingFor,
  type BackfillCandidate,
} from "@/lib/backfillWorklist";

const base: BackfillCandidate = {
  id: "b1",
  state: "pending_deposit",
  check_in: "2026-08-10",
  check_out: "2026-08-20",
  arrived_at: null,
  pay_on_arrival: false,
  total_price: 10000,
  paid: 0,
};

const TODAY = "2026-08-18";

describe("backfill worklist", () => {
  it("includes started stays still sitting in an open state", () => {
    expect(isBackfillCandidate(base, TODAY)).toBe(true);
  });

  it("excludes future stays", () => {
    expect(isBackfillCandidate({ ...base, check_in: "2026-09-01" }, TODAY)).toBe(false);
  });

  it("excludes settled states", () => {
    expect(isBackfillCandidate({ ...base, state: "checked_in" }, TODAY)).toBe(false);
    expect(isBackfillCandidate({ ...base, state: "cancelled" }, TODAY)).toBe(false);
  });

  it("asks for money first", () => {
    expect(nextBackfillAction(base)).toBe("record_payment");
  });

  it("treats pay-on-arrival as money handled", () => {
    expect(nextBackfillAction({ ...base, pay_on_arrival: true })).toBe("mark_arrived");
  });

  it("asks for arrival once money is recorded", () => {
    expect(nextBackfillAction({ ...base, paid: 5000 })).toBe("mark_arrived");
  });

  it("asks for check-in once arrival is logged", () => {
    expect(nextBackfillAction({ ...base, paid: 5000, arrived_at: "2026-08-17T05:00:00Z" })).toBe("check_in");
  });

  it("floors outstanding at zero", () => {
    expect(outstandingFor({ ...base, paid: 12000 })).toBe(0);
    expect(outstandingFor({ ...base, paid: 4000 })).toBe(6000);
  });
});
