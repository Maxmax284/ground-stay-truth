import type { PolicySetting } from "@/hooks/usePolicySettings";

/**
 * Get currency configuration from policy settings.
 * Defaults to THB (฿) for the Thailand fight camp.
 */
export function getCurrencyConfig(policies: PolicySetting[] | undefined | null) {
  const get = (key: string) => policies?.find((p) => p.key === key);
  const symbol = String(get("currency_symbol")?.value ?? "฿").replace(/^"|"$/g, "");
  const code = String(get("currency_code")?.value ?? "THB").replace(/^"|"$/g, "");
  return { symbol, code };
}

/**
 * Format a price amount with the configured currency symbol.
 * Uses policy_settings for currency_symbol. Defaults to ฿.
 */
export function formatPrice(
  amount: number | string | null | undefined,
  policies?: PolicySetting[] | null,
  options?: { decimals?: number }
): string {
  if (amount == null) return "—";
  const num = Number(amount);
  if (isNaN(num)) return "—";
  const { symbol } = getCurrencyConfig(policies);
  const decimals = options?.decimals ?? 2;
  return `${symbol}${num.toFixed(decimals)}`;
}

/**
 * Format price for embed widgets (no access to React hooks).
 * Uses a simple symbol string.
 */
export function formatPriceSimple(
  amount: number | string | null | undefined,
  symbol: string = "฿",
  decimals: number = 0
): string {
  if (amount == null) return "—";
  const num = Number(amount);
  if (isNaN(num)) return "—";
  return `${symbol}${num.toFixed(decimals)}`;
}
