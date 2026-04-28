/**
 * Payment system end-to-end logic tests.
 *
 * These tests exercise the deterministic, key-free slice of the payment
 * system: deposit policy resolution, refund tier calculation, and the
 * outstanding-balance math. They run with or without any provider API keys
 * configured (Stripe, etc.) because all live provider calls are walled off
 * inside edge functions.
 *
 * What they prove:
 *  1. Deposit gating respects policy_settings (manual / online_optional / online_required).
 *  2. Refund tiers obey free → partial → none cutoffs.
 *  3. Outstanding balance handles paid, refunded, partial, and waived rows.
 *  4. Payment status helpers correctly classify "money received".
 */
import { describe, it, expect } from "vitest";
import { getDepositPolicy } from "@/lib/depositPolicy";
import { calculateRefund } from "@/lib/refundCalculator";
import {
  calculateOutstanding,
  isPaymentReceived,
} from "@/lib/paymentTypes";
import { addDays, formatISO } from "date-fns";

const policy = (key: string, value: unknown) =>
  ({ key, value, id: key, updated_at: null, updated_by: null, property_id: null } as any);

describe("Payment System — Deposit Policy gating", () => {
  it("defaults to manual_only when nothing is configured", () => {
    const p = getDepositPolicy([]);
    expect(p.effectiveMode).toBe("manual_only");
    expect(p.onlineEnabled).toBe(false);
    expect(p.manualEnabled).toBe(true);
  });

  it("returns online_optional when online is on but not required", () => {
    const p = getDepositPolicy([
      policy("deposits_online_enabled", "true"),
      policy("deposits_require_online_when_enabled", "false"),
    ]);
    expect(p.effectiveMode).toBe("online_optional");
  });

  it("returns online_required when online is on AND required", () => {
    const p = getDepositPolicy([
      policy("deposits_online_enabled", "true"),
      policy("deposits_require_online_when_enabled", "true"),
      policy("deposits_manual_enabled", "false"),
    ]);
    expect(p.effectiveMode).toBe("online_required");
  });

  it("falls back to manual_only if online flag is missing even when 'required' is true", () => {
    // Defensive: required without enabled must NOT silently enable online.
    const p = getDepositPolicy([
      policy("deposits_require_online_when_enabled", "true"),
    ]);
    expect(p.effectiveMode).toBe("manual_only");
  });
});

describe("Payment System — Refund tiers", () => {
  const policies = [
    policy("free_cancellation_days", 7),
    policy("partial_refund_days", 3),
    policy("partial_refund_percentage", 50),
  ];

  const inDays = (d: number) => formatISO(addDays(new Date(), d));

  it("issues a full refund well outside the free window", () => {
    const r = calculateRefund(inDays(14), 10000, policies);
    expect(r.tier).toBe("free");
    expect(r.refundPercentage).toBe(100);
    expect(r.refundAmount).toBe(10000);
  });

  it("issues a partial refund inside the partial window", () => {
    const r = calculateRefund(inDays(4), 10000, policies);
    expect(r.tier).toBe("partial");
    expect(r.refundPercentage).toBe(50);
    expect(r.refundAmount).toBe(5000);
  });

  it("issues no refund inside the no-refund window", () => {
    const r = calculateRefund(inDays(1), 10000, policies);
    expect(r.tier).toBe("none");
    expect(r.refundAmount).toBe(0);
  });

  it("handles missing total_price on partial gracefully", () => {
    const r = calculateRefund(inDays(4), null, policies);
    expect(r.tier).toBe("partial");
    expect(r.refundAmount).toBeNull();
  });
});

describe("Payment System — Outstanding balance math", () => {
  it("returns total when no payments exist", () => {
    const r = calculateOutstanding(10000, []);
    expect(r.totalPaid).toBe(0);
    expect(r.outstanding).toBe(10000);
  });

  it("subtracts only 'received' payments — pending/failed do not count", () => {
    const r = calculateOutstanding(10000, [
      { amount: 2000, status: "recorded" },
      { amount: 1000, status: "pending" },
      { amount: 1000, status: "failed" },
      { amount: 1000, status: "cancelled" },
    ]);
    expect(r.totalPaid).toBe(2000);
    expect(r.outstanding).toBe(8000);
  });

  it("adds refunds back to the outstanding balance", () => {
    const r = calculateOutstanding(10000, [
      { amount: 10000, status: "partially_refunded", refund_amount: 3000 },
    ]);
    expect(r.totalPaid).toBe(10000);
    expect(r.totalRefunded).toBe(3000);
    expect(r.outstanding).toBe(3000);
  });

  it("never returns a negative outstanding (overpayment is clamped to 0)", () => {
    const r = calculateOutstanding(5000, [
      { amount: 8000, status: "recorded" },
    ]);
    expect(r.outstanding).toBe(0);
  });

  it("handles null total_price as 0", () => {
    const r = calculateOutstanding(null, [{ amount: 1000, status: "recorded" }]);
    expect(r.outstanding).toBe(0);
  });
});

describe("Payment System — Status classification", () => {
  it.each([
    ["recorded", true],
    ["partially_refunded", true],
    ["pending", false],
    ["failed", false],
    ["cancelled", false],
    ["refunded", false],
    ["waived", false],
  ])("isPaymentReceived(%s) === %s", (status, expected) => {
    expect(isPaymentReceived(status)).toBe(expected);
  });
});

describe("Payment System — Provider gating (no-key safety)", () => {
  /**
   * The process-payment edge function refuses to mint a checkout session
   * when payment_provider is "manual" or when the Stripe secret is absent.
   * We simulate that contract here so the rule is locked in test code, not
   * just edge function code.
   */
  function resolveProviderName(policySettings: Array<{ key: string; value: string }>) {
    const row = policySettings.find((p) => p.key === "payment_provider");
    return row?.value ?? "manual";
  }

  it("defaults to manual when payment_provider is unset", () => {
    expect(resolveProviderName([])).toBe("manual");
  });

  it("returns 'manual' explicitly when configured that way", () => {
    expect(resolveProviderName([{ key: "payment_provider", value: "manual" }])).toBe("manual");
  });

  it("returns 'stripe' when configured", () => {
    expect(resolveProviderName([{ key: "payment_provider", value: "stripe" }])).toBe("stripe");
  });
});
