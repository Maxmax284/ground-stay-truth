/**
 * Offline payment recording rules.
 *
 * These guard the exact failure that blocked a manager from recording a
 * ฿7,100 balance payment: the client mirror of the database rules must match
 * the SQL, and a raw row-level-security rejection must never reach the desk.
 */
import { describe, it, expect } from "vitest";
import {
  OFFLINE_PAYMENT_METHODS,
  isOfflinePaymentMethod,
  isOfflineSourceChannel,
  canRecordOfflinePayment,
  assertRecordableOfflinePayment,
  friendlyPaymentError,
} from "@/lib/offlinePayments";

describe("Offline payments — method whitelist", () => {
  it("accepts every offline method the UI offers", () => {
    for (const m of ["cash", "bank_transfer", "other", "offline"]) {
      expect(isOfflinePaymentMethod(m)).toBe(true);
    }
  });

  it("is case and whitespace tolerant", () => {
    expect(isOfflinePaymentMethod("  Cash ")).toBe(true);
    expect(isOfflinePaymentMethod("BANK_TRANSFER")).toBe(true);
  });

  it("refuses provider-owned methods so Stripe rows can't be faked", () => {
    for (const m of ["stripe", "card", "promptpay", "paddle", "link", ""]) {
      expect(isOfflinePaymentMethod(m)).toBe(false);
    }
    expect(isOfflinePaymentMethod(null)).toBe(false);
    expect(isOfflinePaymentMethod(undefined)).toBe(false);
  });

  it("mirrors the SQL list exactly", () => {
    expect([...OFFLINE_PAYMENT_METHODS]).toEqual(["cash", "bank_transfer", "other", "offline"]);
  });
});

describe("Offline payments — source channels", () => {
  it("allows the desk, staff offline entry, and supervisor overrides", () => {
    expect(isOfflineSourceChannel("front_desk")).toBe(true);
    expect(isOfflineSourceChannel("staff_offline")).toBe(true);
    expect(isOfflineSourceChannel("supervisor_override")).toBe(true);
  });

  it("rejects provider channels", () => {
    expect(isOfflineSourceChannel("payment_link")).toBe(false);
    expect(isOfflineSourceChannel("webhook")).toBe(false);
    expect(isOfflineSourceChannel(null)).toBe(false);
  });
});

describe("Offline payments — who may record", () => {
  it("clears admin, manager, and front desk supervisor", () => {
    expect(canRecordOfflinePayment(["admin"])).toBe(true);
    expect(canRecordOfflinePayment(["manager"])).toBe(true);
    expect(canRecordOfflinePayment(["front_desk_supervisor"])).toBe(true);
  });

  it("clears a manager who also holds a lower role — the original bug", () => {
    expect(canRecordOfflinePayment(["front_desk", "manager"])).toBe(true);
  });

  it("blocks plain front desk, housekeeping, driver, and guests", () => {
    expect(canRecordOfflinePayment(["front_desk"])).toBe(false);
    expect(canRecordOfflinePayment(["housekeeping"])).toBe(false);
    expect(canRecordOfflinePayment(["driver"])).toBe(false);
    expect(canRecordOfflinePayment(["guest"])).toBe(false);
    expect(canRecordOfflinePayment([])).toBe(false);
    expect(canRecordOfflinePayment(null)).toBe(false);
  });
});

describe("Offline payments — pre-flight guard", () => {
  it("passes a normal desk cash payment", () => {
    expect(() =>
      assertRecordableOfflinePayment({ amount: 7100, method: "cash", source_channel: "front_desk" })
    ).not.toThrow();
  });

  it("rejects zero, negative, and non-finite amounts", () => {
    for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => assertRecordableOfflinePayment({ amount, method: "cash" })).toThrow("INVALID_AMOUNT");
    }
  });

  it("rejects card methods before they reach the database", () => {
    expect(() => assertRecordableOfflinePayment({ amount: 100, method: "stripe" })).toThrow("METHOD_NOT_OFFLINE");
  });

  it("rejects a bogus channel", () => {
    expect(() =>
      assertRecordableOfflinePayment({ amount: 100, method: "cash", source_channel: "webhook" })
    ).toThrow("INVALID_SOURCE_CHANNEL");
  });
});

describe("Offline payments — overpayment ceiling", () => {
  it("allows an amount equal to the outstanding balance", () => {
    expect(() =>
      assertRecordableOfflinePayment({ amount: 3000, method: "cash", outstanding: 3000 })
    ).not.toThrow();
  });

  it("blocks the full-total double charge on a booking with a deposit", () => {
    // ฿5,000 stay, ฿2,000 deposit already logged — only ฿3,000 may be recorded.
    expect(() =>
      assertRecordableOfflinePayment({ amount: 5000, method: "cash", outstanding: 3000 })
    ).toThrow("AMOUNT_EXCEEDS_OUTSTANDING");
  });

  it("tolerates 1 unit of rounding drift", () => {
    expect(() =>
      assertRecordableOfflinePayment({ amount: 3000.5, method: "cash", outstanding: 3000 })
    ).not.toThrow();
  });

  it("blocks anything on a settled booking", () => {
    expect(() =>
      assertRecordableOfflinePayment({ amount: 100, method: "cash", outstanding: 0 })
    ).toThrow("BOOKING_ALREADY_SETTLED");
  });

  it("stays uncapped when the outstanding balance is unknown", () => {
    expect(() =>
      assertRecordableOfflinePayment({ amount: 99999, method: "cash", outstanding: null })
    ).not.toThrow();
    expect(() => assertRecordableOfflinePayment({ amount: 99999, method: "cash" })).not.toThrow();
  });

  it("explains the overpayment rejection with the real ceiling", () => {
    const msg = friendlyPaymentError(new Error("AMOUNT_EXCEEDS_OUTSTANDING: outstanding 3000"));
    expect(msg).toContain("3000");
    expect(msg).toContain("still owes");
    expect(friendlyPaymentError(new Error("BOOKING_ALREADY_SETTLED"))).toContain("paid in full");
  });
});

describe("Offline payments — human-readable failures", () => {
  it("translates the bare RLS rejection that blocked the ฿7,100 entry", () => {
    const msg = friendlyPaymentError(
      new Error('new row violates row-level security policy for table "payments"')
    );
    expect(msg).toContain("permission");
    expect(msg.toLowerCase()).not.toContain("row-level");
  });

  it("translates a 42501 permission code", () => {
    expect(friendlyPaymentError({ code: "42501", message: "42501: permission denied" })).toContain("permission");
  });

  it("names the fix for each RPC guard", () => {
    expect(friendlyPaymentError(new Error("NOT_AUTHORIZED_TO_RECORD_PAYMENT"))).toContain("admin");
    expect(friendlyPaymentError(new Error("BOOKING_OUTSIDE_PROPERTY_SCOPE"))).toContain("property");
    expect(friendlyPaymentError(new Error("METHOD_NOT_OFFLINE"))).toContain("payment link");
    expect(friendlyPaymentError(new Error("INVALID_AMOUNT"))).toContain("greater than zero");
    expect(friendlyPaymentError(new Error("NOT_AUTHENTICATED"))).toContain("Sign in");
    expect(friendlyPaymentError(new Error("BOOKING_NOT_FOUND"))).toContain("Refresh");
  });

  it("falls back to a usable sentence for anything unknown", () => {
    expect(friendlyPaymentError(new Error(""))).toContain("Try again");
    expect(friendlyPaymentError(undefined)).toContain("Try again");
  });
});
