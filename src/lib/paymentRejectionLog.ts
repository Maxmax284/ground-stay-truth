/**
 * Rejected offline-payment attempts — the manager-facing paper trail.
 *
 * A rejected `record_offline_payment` call aborts its transaction, so the
 * database cannot log its own refusal (the log row would roll back with the
 * rejection). Instead the caller reports the refusal in a second, separate
 * transaction through `log_offline_payment_rejection`, which re-derives the
 * actor and recomputes the booking's real outstanding balance server-side —
 * the browser's numbers are recorded as "attempted", never trusted as truth.
 *
 * Fire-and-forget: a failure to log must never mask the original rejection.
 */
import { supabase } from "@/integrations/supabase/client";

export interface RejectionReport {
  bookingId: string;
  attemptedAmount: number;
  /** Raw error/code from the guard or the database. */
  error: unknown;
  method?: string | null;
  sourceChannel?: string | null;
  /** Which guard tripped: the client mirror or the database. */
  origin?: "client_guard" | "server";
}

/** Rejections worth a manager's attention. Session/validation noise is skipped. */
const LOGGABLE = [
  "AMOUNT_EXCEEDS_OUTSTANDING",
  "BOOKING_ALREADY_SETTLED",
  "NOT_AUTHORIZED_TO_RECORD_PAYMENT",
  "BOOKING_OUTSIDE_PROPERTY_SCOPE",
  "ROW-LEVEL SECURITY",
  "ROW LEVEL SECURITY",
  "42501",
];

export function rejectionCode(err: unknown): string {
  const raw = typeof err === "string" ? err : ((err as any)?.message ?? (err as any)?.details ?? "");
  const text = String(raw).toUpperCase();
  const hit = LOGGABLE.find((c) => text.includes(c));
  if (!hit) return "";
  if (hit.includes("ROW") || hit === "42501") return "RLS_DENIED";
  return hit;
}

export async function reportOfflinePaymentRejection(report: RejectionReport): Promise<void> {
  const code = rejectionCode(report.error);
  if (!code) return;
  const message = typeof report.error === "string"
    ? report.error
    : String((report.error as any)?.message ?? "");
  try {
    await supabase.rpc("log_offline_payment_rejection", {
      _booking_id: report.bookingId,
      _amount: report.attemptedAmount,
      _reason_code: code,
      _message: message.slice(0, 500),
      _method: report.method ?? null,
      _source_channel: report.sourceChannel ?? null,
      _origin: report.origin ?? "server",
    } as any);
  } catch {
    // Never let audit logging swallow or replace the real failure.
  }
}
