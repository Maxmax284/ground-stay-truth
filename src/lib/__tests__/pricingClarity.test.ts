import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  hasDecimals, decimalExplanation, DECIMAL_HELPER, shouldRaiseLargeAdjustmentAlert,
  pickupAddonLine, isExplainedByAddon, linesForAudience, previewLongStay, MANUAL_BADGE_LABEL,
  ROLE_EXPLAINER, LARGE_ADJUSTMENT_LABEL, PICKUP_HELPER, ADDONS_HELPER,
  addonLine, addonHelper, liveAddonRows, isAllPickupAddons,
} from "@/lib/pricingClarity";
import { buildPriceStory } from "@/lib/priceStory";

const story = (adjustments: any[] = [], stored = 9461.55) =>
  buildPriceStory({
    quote: {
      nights: 7, cleaningFee: 0,
      lines: [{ summary: { subtotal: 10500, extraBedTotal: 0, longStayDiscount: { amount: 1038.45, percentage: 9.89, tierLabel: "7+ nights" } } }],
    } as any,
    adjustments, storedTotal: stored, policies: [],
    actorName: () => "Nikki Beale",
  });

describe("pricing clarity", () => {
  it("explains long-stay decimals exactly without rounding", () => {
    const s = story();
    expect(s.chargedTotal).toBe(9461.55);
    expect(decimalExplanation(9461.55, s.hasPolicy)).toBe(DECIMAL_HELPER);
    expect(decimalExplanation(10500, true)).toBeNull();
    expect(hasDecimals(9000)).toBe(false);
  });

  it("stored total is never recalculated", () => {
    const s = story([], 9999.99);
    expect(s.storedTotal).toBe(9999.99);
    expect(s.drift).not.toBe(0);
  });

  it("manual discount marks the story human with approver", () => {
    const s = story([{ id: "a", label: "Returning guest", adjustment_type: "discount", amount_calculated: 500, status: "active", applied_by: "u" }]);
    expect(s.hasHuman).toBe(true);
    expect(s.lines.find((l) => l.kind === "human")?.detail).toContain("Nikki Beale");
    expect(MANUAL_BADGE_LABEL).toBe("Manual discount applied");
    expect(story().hasHuman).toBe(false);
  });

  it("large alert fires at/over threshold only for manual discounts/waivers", () => {
    expect(shouldRaiseLargeAdjustmentAlert({ amount: 10000, kind: "manual_discount" })).toBe(true);
    expect(shouldRaiseLargeAdjustmentAlert({ amount: 9999, kind: "manual_discount" })).toBe(false);
    expect(shouldRaiseLargeAdjustmentAlert({ amount: 12000, kind: "waiver" })).toBe(true);
    expect(shouldRaiseLargeAdjustmentAlert({ amount: 50000, kind: "policy" })).toBe(false);
    expect(shouldRaiseLargeAdjustmentAlert({ amount: 3000, kind: "manual_discount", threshold: 2000 })).toBe(true);
  });

  it("pickup fee shown separately and explains ฿600 gap", () => {
    expect(pickupAddonLine(600, (n) => `฿${n}`)).toBe("Airport pickup: ฿600 separate add-on");
    expect(pickupAddonLine(0, String)).toBeNull();
    expect(isExplainedByAddon(10061.55, 9461.55, 600)).toBe(true);
    expect(isExplainedByAddon(10000, 9461.55, 600)).toBe(false);
  });

  it("labels add-ons as airport pickup only when the payment rows say so", () => {
    expect(addonLine([{ description: "Airport pickup fee" }], 600, (n) => `฿${n}`))
      .toBe("Airport pickup: ฿600 separate add-on");
    expect(addonLine([{ description: "Laundry bundle" }], 1200, (n) => `฿${n}`))
      .toBe("Add-ons: ฿1200 billed separately from the room");
    expect(addonLine([{ description: "Airport pickup fee" }, { description: "Laundry bundle" }], 900, (n) => `฿${n}`))
      .toBe("Add-ons: ฿900 billed separately from the room");
    // No rows (unknown add-ons) stays neutral — never claim pickup without evidence.
    expect(addonLine([], 600, (n) => `฿${n}`)).toBe("Add-ons: ฿600 billed separately from the room");
    expect(addonLine([{ description: "Laundry bundle" }], 0, (n) => `฿${n}`)).toBeNull();
    expect(addonHelper([{ description: "Airport pickup fee" }])).toBe(PICKUP_HELPER);
    expect(addonHelper([{ description: "Laundry bundle" }])).toBe(ADDONS_HELPER);
    expect(isAllPickupAddons([{ description: "Airport Pickup" }])).toBe(true);
    expect(isAllPickupAddons([])).toBe(false);
    expect(liveAddonRows([
      { payment_type: "addon", status: "pending", description: "Airport pickup fee" },
      { payment_type: "addon", status: "cancelled", description: "Airport pickup fee" },
      { payment_type: "deposit", status: "recorded", description: "Deposit" },
    })).toHaveLength(1);
  });

  it("guest view hides operator names and reasons; staff sees them", () => {
    const s = story([{ id: "a", label: "Nikki special reason", adjustment_type: "discount", amount_calculated: 500, status: "active", applied_by: "u" }]);
    const guest = JSON.stringify(linesForAudience(s, "guest"));
    expect(guest).not.toContain("Nikki");
    expect(guest).not.toContain("special reason");
    expect(JSON.stringify(linesForAudience(s, "staff"))).toContain("Nikki Beale");
  });

  it("future preview never touches existing totals", () => {
    expect(previewLongStay(10500, 10)).toBe(9450);
    expect(story().storedTotal).toBe(9461.55);
  });

  it("wording is neutral", () => {
    const copy = [DECIMAL_HELPER, PICKUP_HELPER, LARGE_ADJUSTMENT_LABEL, MANUAL_BADGE_LABEL, ...ROLE_EXPLAINER,
      readFileSync("src/components/PriceBuildPanel.tsx", "utf8")].join(" ").toLowerCase();
    expect(copy).not.toMatch(/fraud|suspicious/);
  });
});
