// Arrival Intelligence retention policy (Stage 5)
// -----------------------------------------------------------------------------
// Travel evidence a guest uploads is personal data. It lives only as long as it
// is operationally useful, then it is deleted. Provenance/audit rows survive
// longer because they carry WHO set a value and WHEN — never the payload, and
// booking references stay masked.
//
// These numbers are the single source of truth. The daily purge job
// (supabase/functions/cleanup-retention) mirrors them; keep both in step.
// -----------------------------------------------------------------------------

export const ARRIVAL_RETENTION = {
  /** Uploaded screenshots/confirmations: deleted this many days after checkout. */
  evidenceDaysAfterCheckout: 30,
  /** Derived flight facts (one row per aircraft/date): deleted after this. */
  flightFactDays: 90,
  /** Resolved or dismissed conflicts: deleted this long after resolution. */
  resolvedConflictDays: 90,
  /** Provenance / stage audit rows: kept this long, payload-free. */
  auditDays: 730,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO cutoff: anything older than this is expired. */
export function retentionCutoff(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

/** True when uploaded evidence for a stay ending `checkOut` may be deleted. */
export function isEvidenceExpired(
  checkOut: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!checkOut) return false; // no known checkout → never guess, keep it
  const end = new Date(checkOut).getTime();
  if (Number.isNaN(end)) return false;
  return now.getTime() - end > ARRIVAL_RETENTION.evidenceDaysAfterCheckout * DAY_MS;
}

/** Days remaining before evidence for a stay is purged. 0 = due now. */
export function daysUntilEvidencePurge(
  checkOut: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!checkOut) return null;
  const end = new Date(checkOut).getTime();
  if (Number.isNaN(end)) return null;
  const due = end + ARRIVAL_RETENTION.evidenceDaysAfterCheckout * DAY_MS;
  return Math.max(0, Math.ceil((due - now.getTime()) / DAY_MS));
}

/** Plain-language line for guests and staff. No jargon, no vague promises. */
export function describeEvidenceRetention(): string {
  return `Deleted ${ARRIVAL_RETENTION.evidenceDaysAfterCheckout} days after checkout.`;
}
