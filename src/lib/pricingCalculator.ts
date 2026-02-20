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

export interface PricingSummary {
  nights: NightBreakdown[];
  subtotal: number;
  cleaningFee: number;
  longStayDiscount: LongStayDiscount | null;
  total: number;
}

/**
 * Get the best applicable long-stay discount tier.
 * Returns null if no discount applies.
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
 * Calculate nightly prices using the constitutional cascade:
 * 1. Manual override (highest priority — handled separately via price_override on booking)
 * 2. Seasonal pricing rules
 * 3. Weekend pricing
 * 4. Base price
 *
 * Then apply long-stay discount if eligible.
 */
export function calculatePricing(
  unit: Unit,
  checkIn: string,
  checkOut: string,
  pricingRules: PricingRule[],
  priceOverride?: number | null,
  policies?: PolicySetting[] | null
): PricingSummary {
  if (!checkIn || !checkOut) {
    return { nights: [], subtotal: 0, cleaningFee: 0, longStayDiscount: null, total: 0 };
  }

  const startDate = parseISO(checkIn);
  const endDate = parseISO(checkOut);

  if (endDate <= startDate) {
    return { nights: [], subtotal: 0, cleaningFee: 0, longStayDiscount: null, total: 0 };
  }

  // Nights = each day from check-in up to (but not including) check-out
  const nightDates = eachDayOfInterval({ start: startDate, end: new Date(endDate.getTime() - 86400000) });

  const unitRules = pricingRules
    .filter((r) => r.unit_id === unit.id)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const nights: NightBreakdown[] = nightDates.map((date) => {
    const dateStr = format(date, "yyyy-MM-dd");

    // 1. Manual override — flat per night
    if (priceOverride != null && priceOverride > 0) {
      return { date: dateStr, price: priceOverride, source: "override" as const };
    }

    // 2. Seasonal pricing rule
    const matchingRule = unitRules.find(
      (r) => dateStr >= r.start_date && dateStr <= r.end_date
    );
    if (matchingRule) {
      return {
        date: dateStr,
        price: Number(matchingRule.price),
        source: "seasonal" as const,
        ruleName: matchingRule.name,
      };
    }

    // 3. Weekend pricing
    if (isWeekend(date) && unit.weekend_price != null && Number(unit.weekend_price) > 0) {
      return { date: dateStr, price: Number(unit.weekend_price), source: "weekend" as const };
    }

    // 4. Base price
    return { date: dateStr, price: Number(unit.base_price), source: "base" as const };
  });

  const subtotal = nights.reduce((sum, n) => sum + n.price, 0);
  const cleaningFee = Number(unit.cleaning_fee ?? 0);

  // Long-stay discount
  const longStayDiscount = getLongStayDiscount(nights.length, subtotal, policies);
  const discountAmount = longStayDiscount?.amount ?? 0;

  return {
    nights,
    subtotal,
    cleaningFee,
    longStayDiscount,
    total: subtotal - discountAmount + cleaningFee,
  };
}
