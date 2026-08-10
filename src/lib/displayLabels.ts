/**
 * Central display-label helpers.
 *
 * Backend values (`confirmed`, `pending_deposit`, `pay_on_arrival`, `tm30_confirmed`)
 * are stable contract data and are NEVER translated in the database, in query
 * filters, or in API payloads. This module is the only place that turns those
 * codes into text a human reads, so a language switch changes every badge at once.
 *
 * If a code has no translation yet, we fall back to a humanized version of the
 * code instead of showing the raw key.
 */
import { useTranslation } from "react-i18next";
import { humanizeKey } from "@/i18n/missingKeys";

export type LabelGroup =
  | "bookingState"
  | "paymentStatus"
  | "paymentType"
  | "paymentMethod"
  | "depositState"
  | "pickupResolution"
  | "documentStatus"
  | "documentType"
  | "tm30Status"
  | "cleaningStatus"
  | "unitStatus"
  | "housekeepingStatus"
  | "driverAssignment"
  | "checkoutBlocker"
  | "offlineAck"
  | "marker";

function humanizeCode(code: string): string {
  return humanizeKey(code);
}

/**
 * Translate a backend code. Safe with null/undefined — returns an em dash.
 */
export function translateLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  group: LabelGroup,
  code: string | null | undefined,
  fallback?: string,
): string {
  if (!code) return fallback ?? "—";
  const key = `labels.${group}.${code}`;
  const value = t(key, { defaultValue: "" });
  if (value && value !== key) return value;
  return fallback ?? humanizeCode(code);
}

export function useDisplayLabels() {
  const { t, i18n } = useTranslation();

  const label = (group: LabelGroup, code: string | null | undefined, fallback?: string) =>
    translateLabel(t, group, code, fallback);

  return {
    /** Generic entry point — `label("bookingState", booking.status)` */
    label,
    bookingState: (code?: string | null) => label("bookingState", code),
    paymentStatus: (code?: string | null) => label("paymentStatus", code),
    paymentType: (code?: string | null) => label("paymentType", code),
    paymentMethod: (code?: string | null) => label("paymentMethod", code),
    depositState: (code?: string | null) => label("depositState", code),
    pickupResolution: (code?: string | null) => label("pickupResolution", code),
    documentStatus: (code?: string | null) => label("documentStatus", code),
    documentType: (code?: string | null) => label("documentType", code),
    tm30Status: (code?: string | null) => label("tm30Status", code),
    cleaningStatus: (code?: string | null) => label("cleaningStatus", code),
    unitStatus: (code?: string | null) => label("unitStatus", code),
    housekeepingStatus: (code?: string | null) => label("housekeepingStatus", code),
    driverAssignment: (code?: string | null) => label("driverAssignment", code),
    checkoutBlocker: (code?: string | null) => label("checkoutBlocker", code),
    offlineAck: (code?: string | null) => label("offlineAck", code),
    marker: (code?: string | null) => label("marker", code),
    /** Current UI language code, for anything that needs to pass it onward. */
    language: i18n.language,
  };
}
