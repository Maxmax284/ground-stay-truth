/**
 * Pure, dependency-free Fenrir mapper + PII scrubber.
 *
 * Kept in a separate file so it is importable from both:
 *   - Deno edge functions (via _shared/fenrir.ts)
 *   - Node/Vitest smoke tests (src/lib/fenrir/__tests__/mapper.test.ts)
 *
 * No Deno globals, no fetch, no supabase — pure functions only.
 */

export type FenrirSeverity = "low" | "medium" | "high" | "critical";

/** Internal (legacy snake_case) → Fenrir dotted namespace. */
export const FENRIR_EVENT_MAP: Record<string, string> = {
  // auth / admin
  staff_login: "auth.login_success",
  staff_login_failed: "auth.login_failed",
  privilege_escalation: "admin.privilege_escalation",
  role_changed: "admin.role_changed",
  staff_created: "admin.staff_created",

  // guest data
  guest_data_access: "guest.data_access",
  guest_data_modified: "guest.data_modified",
  bulk_guest_export: "guest.bulk_export",
  gdpr_request_received: "guest.gdpr_request",

  // payments
  payment_processed: "payment.processed",
  payment_failed: "payment.failed",
  payment_anomaly: "payment.anomaly",
  chargeback_received: "payment.chargeback",
  card_testing_detected: "payment.card_testing",
  refund_issued: "payment.refund_issued",
  rate_override: "payment.rate_override",
  unauthorized_discount: "payment.unauthorized_discount",
  webhook_rejected: "payment.webhook_rejected",

  // access & security
  cross_property_access: "access.cross_property",
  after_hours_access: "access.after_hours",
  key_card_anomaly: "access.key_card_anomaly",
  data_residency_violation: "compliance.residency_violation",
  booking_fraud_flag: "booking.fraud_flag",
  guest_complaint_escalated: "guest.complaint_escalated",

  // system (dormant unless inbound re-approved)
  emergency_freeze: "system.emergency_freeze",
  emergency_unfreeze: "system.emergency_unfreeze",
};

/** Fields that must never cross the wire in the clear. */
export const PII_KEYS = new Set<string>([
  "guest_name",
  "guest_full_name",
  "full_name",
  "first_name",
  "last_name",
  "guest_email",
  "email",
  "phone",
  "phone_number",
  "passport_number",
  "passport",
  "id_number",
  "document_number",
  "address",
  "notes",
  "description",
  "message",
  "content",
  "conversation",
]);

/** SHA-256 hex hash for identifiers (e.g. actor_email). */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Bucket monetary amounts into coarse ranges. */
export function bucketAmount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 100) return "<100";
  if (n < 1_000) return "100-1k";
  if (n < 10_000) return "1k-10k";
  if (n < 100_000) return "10k-100k";
  return "100k+";
}

export async function scrubDetails(
  details: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (v === null || v === undefined) continue;
    if (PII_KEYS.has(k)) continue; // drop raw PII entirely
    if (k === "actor_email" && typeof v === "string") {
      out.actor_email_hash = await sha256Hex(v);
      continue;
    }
    if (k === "amount" && typeof v === "number") {
      out.amount_bucket = bucketAmount(v);
      continue;
    }
    if (k === "fields_accessed" || k === "fields_changed") {
      out[k] = v;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function mapEventType(internal: string): string | null {
  return FENRIR_EVENT_MAP[internal] ?? null;
}
