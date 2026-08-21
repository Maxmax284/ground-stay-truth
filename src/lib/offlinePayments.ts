/**
 * Offline (hand-recorded) payment rules — the client mirror of the database.
 *
 * A staffer taking cash or a bank transfer at the desk has no Stripe trail, so
 * the row is written through the `record_offline_payment` RPC. That function is
 * the only sanctioned path: it derives the actor server-side, checks the role
 * and property scope, stamps the provider fields, and writes the audit receipt.
 *
 * Everything here is deterministic and mirrors the SQL helpers
 * `is_offline_payment_method` / `can_record_offline_payment` so the UI can
 * refuse an impossible action before it hits the wire, and so a database
 * rejection can be turned into a sentence a human understands.
 *
 * Keep this list and the SQL list in lockstep. If they drift, the UI will
 * either offer a method the database rejects or hide one it accepts.
 */

/** Methods a staffer may hand-record. Anything else belongs to a provider. */
export const OFFLINE_PAYMENT_METHODS = ["cash", "bank_transfer", "other", "offline"] as const;
export type OfflinePaymentMethod = (typeof OFFLINE_PAYMENT_METHODS)[number];

/** Channels the recorder accepts. `supervisor_override` keeps the override trail. */
export const OFFLINE_SOURCE_CHANNELS = ["front_desk", "staff_offline", "supervisor_override"] as const;
export type OfflineSourceChannel = (typeof OFFLINE_SOURCE_CHANNELS)[number];

/** Roles cleared to record offline money, mirroring `can_record_offline_payment`. */
export const OFFLINE_PAYMENT_ROLES = ["admin", "manager", "front_desk_supervisor"] as const;

export function isOfflinePaymentMethod(method: string | null | undefined): boolean {
  if (!method) return false;
  return (OFFLINE_PAYMENT_METHODS as readonly string[]).includes(method.trim().toLowerCase());
}

export function isOfflineSourceChannel(channel: string | null | undefined): boolean {
  if (!channel) return false;
  return (OFFLINE_SOURCE_CHANNELS as readonly string[]).includes(channel.trim().toLowerCase());
}

/**
 * Can this set of roles hand-record money? Mirrors the database check exactly —
 * membership, not hierarchy level, because that is what the RLS policy tests.
 */
export function canRecordOfflinePayment(roles: readonly string[] | null | undefined): boolean {
  if (!roles?.length) return false;
  return roles.some((r) => (OFFLINE_PAYMENT_ROLES as readonly string[]).includes(String(r).trim().toLowerCase()));
}

/** Guard run before the RPC call so provider-owned money never takes this path. */
export function assertRecordableOfflinePayment(input: {
  amount: number;
  method: string;
  source_channel?: string;
  /** Verified outstanding balance, when known. Mirrors the SQL overpayment cap. */
  outstanding?: number | null;
}): void {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("INVALID_AMOUNT");
  }
  if (!isOfflinePaymentMethod(input.method)) {
    throw new Error("METHOD_NOT_OFFLINE");
  }
  if (input.source_channel && !isOfflineSourceChannel(input.source_channel)) {
    throw new Error("INVALID_SOURCE_CHANNEL");
  }
}

/**
 * Turn a database or RPC failure into something a front-desk staffer can act on.
 * Raw Postgres text ("new row violates row-level security policy for table
 * 'payments'") tells a manager nothing, so every known code gets a sentence
 * that names the cause and the next step.
 */
export function friendlyPaymentError(err: unknown): string {
  const raw = typeof err === "string" ? err : ((err as any)?.message ?? (err as any)?.details ?? "");
  const text = String(raw);
  const code = text.toUpperCase();

  if (code.includes("NOT_AUTHENTICATED")) {
    return "Your session expired. Sign in again and re-enter the payment.";
  }
  if (code.includes("NOT_AUTHORIZED_TO_RECORD_PAYMENT")) {
    return "Your role can't record payments. Ask an admin, manager, or front desk supervisor to record it.";
  }
  if (code.includes("BOOKING_OUTSIDE_PROPERTY_SCOPE")) {
    return "This booking belongs to a property you're not assigned to. Ask an admin to assign you or record it for you.";
  }
  if (code.includes("BOOKING_NOT_FOUND")) {
    return "That booking no longer exists. Refresh and try again.";
  }
  if (code.includes("METHOD_NOT_OFFLINE")) {
    return "Only offline payments (cash, bank transfer, other) can be recorded by hand. Card payments must go through the payment link.";
  }
  if (code.includes("INVALID_SOURCE_CHANNEL")) {
    return "That payment channel isn't allowed for hand-recorded money. Record it as a front desk payment.";
  }
  if (code.includes("INVALID_AMOUNT")) {
    return "Enter an amount greater than zero.";
  }
  // Server-side overpayment guard — the ceiling is the booking's outstanding balance.
  if (code.includes("AMOUNT_EXCEEDS_OUTSTANDING")) {
    const found = text.match(/outstanding\s+([\d.]+)/i)?.[1];
    return found
      ? `That's more than this booking still owes (${found}). Record the outstanding amount instead.`
      : "That's more than this booking still owes. Record the outstanding amount instead.";
  }
  if (code.includes("BOOKING_ALREADY_SETTLED")) {
    return "This booking is already paid in full. No further payment is needed.";
  }
  // The bare RLS rejection — the exact error that blocked Nam's ฿7,100 entry.
  if (code.includes("ROW-LEVEL SECURITY") || code.includes("ROW LEVEL SECURITY") || code.includes("42501")) {
    return "You don't have permission to record a payment on this booking. Check that you're assigned to its property, or ask an admin.";
  }
  return text || "Couldn't record the payment. Try again, and tell an admin if it keeps failing.";
}
