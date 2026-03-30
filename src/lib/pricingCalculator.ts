import { eachDayOfInterval, parseISO, isWeekend, format, differenceInCalendarDays } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import type { PolicySetting } from "@/hooks/usePolicySettings";

type Unit = Tables<"units">;
type PricingRule = Tables<"pricing_rules">;

export interface NightBreakdown {
  date: string;
  price: number;
  source: "override" | "seasonal" | "weekend" | "base";
  ruleName?: string;
}

export interface LongStayDiscount {
  tierLabel: string;
  percentage: number;
  amount: number;
}

export interface LoyaltyDiscount {
  tierLabel: string;
  percentage: number;
  amount: number;
}

export interface PricingSummary {
  nights: NightBreakdown[];
  subtotal: number;
  cleaningFee: number;
  extraBedTotal: number;
  longStayDiscount: LongStayDiscount | null;
  loyaltyDiscount: LoyaltyDiscount | null;
  total: number;
}

/**
 * Get the best applicable long-stay discount tier.
 */
export function getLongStayDiscount(
  nightCount: number,
  subtotal: number,
  policies?: PolicySetting[] | null
): LongStayDiscount | null {
  if (!policies || nightCount < 7) return null;

  const get = (key: string) => {
    const p = policies.find((p) => p.key === key);
    return p ? Number(p.value) : 0;
  };

  const tiers = [
    { min: 30, pct: get("long_stay_30_nights_discount_percentage"), label: "30+ nights" },
    { min: 14, pct: get("long_stay_14_nights_discount_percentage"), label: "14+ nights" },
    { min: 7, pct: get("long_stay_7_nights_discount_percentage"), label: "7+ nights" },
  ];

  for (const tier of tiers) {
    if (nightCount >= tier.min && tier.pct > 0) {
      return {
        tierLabel: tier.label,
        percentage: tier.pct,
        amount: Math.round((subtotal * tier.pct) / 100 * 100) / 100,
      };
    }
  }

  return null;
}

/**
 * Get loyalty discount based on completed stays.
 * Only activates when loyalty_pricing_enabled is true and percentages > 0.
 */
export function getLoyaltyDiscount(
  completedStays: number,
  subtotal: number,
  policies?: PolicySetting[] | null
): LoyaltyDiscount | null {
  if (!policies || completedStays < 1) return null;

  const get = (key: string) => {
    const p = policies.find((p) => p.key === key);
    return p ? String(p.value) : "";
  };

  const enabled = get("loyalty_pricing_enabled") === "true";
  if (!enabled) return null;

  const pct3 = Number(get("loyalty_3rd_stay_discount_percentage")) || 0;
  const pct2 = Number(get("loyalty_2nd_stay_discount_percentage")) || 0;

  let pct = 0;
  let label = "";
  if (completedStays >= 2 && pct3 > 0) {
    pct = pct3;
    label = "3rd+ stay";
  } else if (completedStays >= 1 && pct2 > 0) {
    pct = pct2;
    label = "2nd stay";
  }

  if (pct <= 0) return null;

  return {
    tierLabel: label,
    percentage: pct,
    amount: Math.round((subtotal * pct) / 100 * 100) / 100,
  };
}

/**
 * Calculate nightly prices using the constitutional cascade:
 * 1. Manual override (highest priority)
 * 2. Seasonal pricing rules
 * 3. Weekend pricing
 * 4. Base price
 *
 * Then apply long-stay and/or loyalty discounts.
 */
export function calculatePricing(
  unit: Unit,
  checkIn: string,
  checkOut: string,
  pricingRules: PricingRule[],
  priceOverride?: number | null,
  policies?: PolicySetting[] | null,
  completedStays?: number,
  extraBeds?: number
): PricingSummary {
  if (!checkIn || !checkOut) {
    return { nights: [], subtotal: 0, cleaningFee: 0, extraBedTotal: 0, longStayDiscount: null, loyaltyDiscount: null, total: 0 };
  }

  const startDate = parseISO(checkIn);
  const endDate = parseISO(checkOut);

  if (endDate <= startDate) {
    return { nights: [], subtotal: 0, cleaningFee: 0, extraBedTotal: 0, longStayDiscount: null, loyaltyDiscount: null, total: 0 };
  }

  const nightDates = eachDayOfInterval({ start: startDate, end: new Date(endDate.getTime() - 86400000) });
  const nightCount = nightDates.length;

  // Per-person pricing: multiply all per-night prices by the unit capacity
  const pricingType = (unit as any).pricing_type as string | undefined;
  const isPerPerson = pricingType === "per_person";
  const guestMultiplier = isPerPerson ? (unit.capacity || 2) : 1;

  // Check if weekly or monthly flat rate applies
  const weeklyRate = unit.weekly_rate != null ? Number(unit.weekly_rate) : null;
  const monthlyRate = unit.monthly_rate != null ? Number(unit.monthly_rate) : null;

  let useFixedRate = false;
  let fixedRatePerNight = 0;
  let fixedRateSource: "monthly_rate" | "weekly_rate" | null = null;

  if (monthlyRate && monthlyRate > 0 && nightCount >= 28) {
    fixedRatePerNight = Math.round((monthlyRate / 30) * 100) / 100;
    useFixedRate = true;
    fixedRateSource = "monthly_rate";
  } else if (weeklyRate && weeklyRate > 0 && nightCount >= 7) {
    fixedRatePerNight = Math.round((weeklyRate / 7) * 100) / 100;
    useFixedRate = true;
    fixedRateSource = "weekly_rate";
  }

  const unitRules = pricingRules
    .filter((r) => r.unit_id === unit.id)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const nights: NightBreakdown[] = nightDates.map((date) => {
    const dateStr = format(date, "yyyy-MM-dd");

    if (priceOverride != null && priceOverride > 0) {
      return { date: dateStr, price: priceOverride, source: "override" as const };
    }

    // Weekly/monthly flat rate takes priority over seasonal/weekend but not override
    if (useFixedRate) {
      return { date: dateStr, price: fixedRatePerNight, source: "base" as const, ruleName: fixedRateSource === "monthly_rate" ? "Monthly Rate" : "Weekly Rate" };
    }

    const matchingRule = unitRules.find(
      (r) => dateStr >= r.start_date && dateStr <= r.end_date
    );
    if (matchingRule) {
      let seasonalPrice: number;
      const isPercentage = matchingRule.adjustment_type === "percentage" && matchingRule.adjustment_value != null;

      if (isPercentage) {
        const baseForCalc = isWeekend(date) && unit.weekend_price != null && Number(unit.weekend_price) > 0
          ? Number(unit.weekend_price)
          : Number(unit.base_price);
        seasonalPrice = Math.round(baseForCalc * (1 + Number(matchingRule.adjustment_value) / 100) * 100) / 100;
      } else if (isWeekend(date) && matchingRule.weekend_price != null && Number(matchingRule.weekend_price) > 0) {
        seasonalPrice = Number(matchingRule.weekend_price);
      } else {
        seasonalPrice = Number(matchingRule.price);
      }

      return {
        date: dateStr,
        price: seasonalPrice,
        source: "seasonal" as const,
        ruleName: matchingRule.name,
      };
    }

    if (isWeekend(date) && unit.weekend_price != null && Number(unit.weekend_price) > 0) {
      return { date: dateStr, price: Number(unit.weekend_price), source: "weekend" as const };
    }

    return { date: dateStr, price: Number(unit.base_price), source: "base" as const };
  });

  // Apply per-person multiplier to each night
  if (isPerPerson) {
    nights.forEach((n) => { n.price = Math.round(n.price * guestMultiplier * 100) / 100; });
  }

  const subtotal = nights.reduce((sum, n) => sum + n.price, 0);
  const cleaningFee = Number(unit.cleaning_fee ?? 0);

  // Long-stay discount (skip if already using weekly/monthly rate)
  const longStayDiscount = useFixedRate ? null : getLongStayDiscount(nights.length, subtotal, policies);

  // Loyalty discount
  const loyaltyDiscount = getLoyaltyDiscount(completedStays ?? 0, subtotal, policies);

  // Resolve stacking
  let discountAmount = 0;
  let appliedLongStay = longStayDiscount;
  let appliedLoyalty = loyaltyDiscount;

  if (longStayDiscount && loyaltyDiscount) {
    const stacksStr = policies?.find((p) => p.key === "loyalty_discount_stacks_with_long_stay");
    const stacks = stacksStr ? String(stacksStr.value) === "true" : false;

    if (stacks) {
      const loyaltyAmt = loyaltyDiscount.amount;
      const remainder = subtotal - loyaltyAmt;
      const longStayAmt = Math.round((remainder * longStayDiscount.percentage) / 100 * 100) / 100;
      appliedLongStay = { ...longStayDiscount, amount: longStayAmt };
      discountAmount = loyaltyAmt + longStayAmt;
    } else {
      if (longStayDiscount.amount >= loyaltyDiscount.amount) {
        appliedLoyalty = null;
        discountAmount = longStayDiscount.amount;
      } else {
        appliedLongStay = null;
        discountAmount = loyaltyDiscount.amount;
      }
    }
  } else {
    discountAmount = (longStayDiscount?.amount ?? 0) + (loyaltyDiscount?.amount ?? 0);
  }

  // Extra bed surcharge
  const bedCount = Math.min(extraBeds ?? 0, (unit as any).max_extra_beds ?? 0);
  const extraBedFee = Number((unit as any).extra_bed_fee) || 0;
  const extraBedTotal = bedCount * extraBedFee * nights.length;

  return {
    nights,
    subtotal,
    cleaningFee,
    extraBedTotal,
    longStayDiscount: appliedLongStay,
    loyaltyDiscount: appliedLoyalty,
    total: subtotal - discountAmount + cleaningFee + extraBedTotal,
  };
}
