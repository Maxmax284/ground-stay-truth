/**
 * Fenrir Lock outbound helper — one-way doctrine.
 *
 *   GroundStay  ──signed events──▶  Fenrir Lock
 *   Fenrir Lock  ─X─ cannot control ─X─  GroundStay
 *
 * Responsibilities:
 *   1. Allowlist internal event names (unknown types are rejected).
 *   2. Map legacy internal names to the Fenrir dotted namespace envelope.
 *   3. Minimize PII (hash actor_email, bucket amounts, drop raw guest data).
 *   4. Stamp correlation / environment / platform metadata.
 *   5. Read the API key server-side only (integration_secrets, env fallback).
 *   6. Never throw into the caller — Fenrir downtime must not break ops.
 */

// deno-lint-ignore-file no-explicit-any

export type FenrirSeverity = "low" | "medium" | "high" | "critical";

export interface InternalFenrirEvent {
  event_type: string;
  severity: FenrirSeverity;
  confidence_score?: number;
  user_email?: string;
  details?: Record<string, unknown>;
  source_ip?: string;
  timestamp?: string;
}

/**
 * Internal (legacy snake_case) → Fenrir dotted namespace.
 * Unknown internal names are rejected by the helper.
 */
export const FENRIR_EVENT_MAP: Record<string, string> = {
  // auth
  staff_login: "auth.login_success",
  staff_login_failed: "auth.login_failed",
  privilege_escalation: "admin.privilege_escalation",

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
const PII_KEYS = new Set([
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
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Bucket monetary amounts into coarse ranges. */
function bucketAmount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 100) return "<100";
  if (n < 1_000) return "100-1k";
  if (n < 10_000) return "1k-10k";
  if (n < 100_000) return "10k-100k";
  return "100k+";
}

async function scrubDetails(
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
      // keep field names (they describe *what* touched, not the values)
      out[k] = v;
      continue;
    }
    out[k] = v;
  }
  return out;
}

interface DispatchDeps {
  supabase: any;
  environment?: "staging" | "production";
  correlationId?: string;
}

/**
 * Server-side entry point. Returns silently on any failure — Fenrir outage
 * must never break GroundStay operations.
 */
export async function sendFenrirSecurityEvent(
  event: InternalFenrirEvent,
  { supabase, environment = "staging", correlationId }: DispatchDeps,
): Promise<{ status: "sent" | "logged" | "rejected" | "skipped"; reason?: string }> {
  try {
    const dotted = FENRIR_EVENT_MAP[event.event_type];
    if (!dotted) {
      return { status: "rejected", reason: `unknown event_type: ${event.event_type}` };
    }

    // Read config server-side only
    const { data: policies } = await supabase
      .from("policy_settings")
      .select("key, value")
      .in("key", ["fenrir_enabled", "fenrir_endpoint"]);

    const policyMap = new Map(
      (policies ?? []).map((p: any) => [p.key, String(p.value).replace(/^"|"$/g, "")]),
    );
    const enabled = policyMap.get("fenrir_enabled") === "true";
    const endpoint = policyMap.get("fenrir_endpoint") || "";

    const safeDetails = await scrubDetails(event.details ?? {});
    const envelope = {
      event_type: dotted,
      internal_event_type: event.event_type,
      severity: event.severity,
      confidence_score: event.confidence_score ?? 50,
      source_platform: "groundstay",
      platform_version: "groundstay-1.0",
      environment,
      correlation_id: correlationId ?? crypto.randomUUID(),
      timestamp: event.timestamp ?? new Date().toISOString(),
      details: safeDetails,
    };

    // Always log locally for audit trail (no PII: we log the scrubbed envelope)
    await supabase.from("security_events").insert({
      event_type: event.event_type,
      severity: event.severity,
      actor_id: (event.details as any)?.actor_id ?? null,
      actor_role: (event.details as any)?.actor_role ?? null,
      actor_email: null, // never store raw actor email from the outbound path
      confidence_score: envelope.confidence_score,
      details: envelope,
      source_ip: event.source_ip ?? null,
    });

    if (!enabled || !endpoint) {
      return { status: "logged", reason: "fenrir disabled or no endpoint" };
    }

    const { data: secretRow } = await supabase
      .from("integration_secrets")
      .select("encrypted_value")
      .eq("secret_key", "fenrir_api_key")
      .maybeSingle();
    const apiKey = secretRow?.encrypted_value || Deno.env.get("FENRIR_API_KEY") || "";
    if (!apiKey) return { status: "logged", reason: "no api key configured" };

    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "x-groundstay-environment": environment,
        },
        body: JSON.stringify(envelope),
      });
      if (!resp.ok) return { status: "logged", reason: `http ${resp.status}` };
      return { status: "sent" };
    } catch (err) {
      return { status: "logged", reason: `network: ${(err as Error).message}` };
    }
  } catch (err) {
    console.error("[fenrir] helper failure (swallowed):", err);
    return { status: "skipped", reason: (err as Error).message };
  }
}
