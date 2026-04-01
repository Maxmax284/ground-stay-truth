/**
 * Format a timestamp in the property timezone (Asia/Bangkok).
 * Keeps DB storage unchanged — this is display-only.
 */
export function formatInPropertyTimezone(
  date: string | Date,
  formatStr: "datetime" | "date" | "time" = "datetime"
): string {
  const PROPERTY_TZ = "Asia/Bangkok";
  const d = typeof date === "string" ? new Date(date) : date;

  const options: Intl.DateTimeFormatOptions = {
    timeZone: PROPERTY_TZ,
    ...(formatStr === "datetime" && {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
    ...(formatStr === "date" && {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    ...(formatStr === "time" && {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  };

  return new Intl.DateTimeFormat("en-US", options).format(d);
}
