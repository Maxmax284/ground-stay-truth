/**
 * Single source of truth for operational time display.
 *
 * Policy:
 *  - Database stores absolute timestamps in UTC (timestamptz).
 *  - Every staff/driver-facing screen renders in the camp timezone (Asia/Bangkok).
 *  - Arrival/pickup times are always labeled so nobody guesses the offset.
 *
 * Never format an operational timestamp with `new Date(x).toLocaleString()`,
 * `format()` from date-fns, or string slicing — those follow the device
 * timezone (or raw UTC) and produce the 7-hour mismatch we shipped before.
 */

export const CAMP_TIMEZONE = "Asia/Bangkok";
export const CAMP_TIMEZONE_LABEL = "Thailand time";

type Kind = "datetime" | "date" | "time";

function parse(date: string | Date): Date | null {
  const d = typeof date === "string" ? new Date(date) : date;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function build(kind: Kind): Intl.DateTimeFormatOptions {
  const base: Intl.DateTimeFormatOptions = { timeZone: CAMP_TIMEZONE };
  if (kind === "date") return { ...base, year: "numeric", month: "short", day: "numeric" };
  if (kind === "time") return { ...base, hour: "numeric", minute: "2-digit", hour12: true };
  return {
    ...base,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
}

/**
 * Format a timestamp in the property timezone (Asia/Bangkok).
 * Keeps DB storage unchanged — this is display-only.
 */
export function formatInPropertyTimezone(
  date: string | Date,
  formatStr: Kind = "datetime"
): string {
  const d = parse(date);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", build(formatStr)).format(d);
}

/** "2:45 PM" in camp time. */
export function formatCampTime(date: string | Date | null | undefined): string {
  return date ? formatInPropertyTimezone(date, "time") : "—";
}

/** "Aug 5, 2026" in camp time. */
export function formatCampDate(date: string | Date | null | undefined): string {
  return date ? formatInPropertyTimezone(date, "date") : "—";
}

/** "Aug 5, 2026, 2:45 PM" in camp time. */
export function formatCampDateTime(date: string | Date | null | undefined): string {
  return date ? formatInPropertyTimezone(date, "datetime") : "—";
}

/** "Aug 5, 2:45 PM" — compact operational stamp, no year. */
export function formatCampShort(date: string | Date | null | undefined): string {
  const d = date ? parse(date) : null;
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CAMP_TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** Same as formatCampDateTime but explicitly labeled: "Aug 5, 2:45 PM Thailand time". */
export function formatCampLabeled(
  date: string | Date | null | undefined,
  kind: Kind = "datetime"
): string {
  if (!date) return "—";
  const base = kind === "datetime" ? formatCampShort(date) : formatInPropertyTimezone(date, kind);
  return `${base} ${CAMP_TIMEZONE_LABEL}`;
}
