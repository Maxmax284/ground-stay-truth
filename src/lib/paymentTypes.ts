/**
 * Payment system types and helpers — single source of truth for payment status model.
 */

/** All valid payment statuses in the system */
export type PaymentStatus =
  | "pending"           // Checkout session created, awaiting provider confirmation
  | "recorded"          // Payment confirmed/received (success)
  | "failed"            // Payment attempt declined
  | "cancelled"         // User abandoned or session expired
  | "refunded"          // Full refund issued
  | "partially_refunded" // Partial refund issued
  | "waived";           // Admin decision — no money required

/** What the payment is for */
export type PaymentType =
  | "deposit"           // Booking deposit
  | "balance"           // Remaining balance
  | "addon"             // Airport pickup, training, etc.
  | "security_deposit"  // Damage deposit
  | "booking_fee";      // Platform/processing fee (separate from room cost)

/** Supported payment providers */
export type PaymentProvider = "stripe" | "paypal" | "manual";

/** Status labels for UI display */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  recorded: "Paid",
  failed: "Failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  partially_refunded: "Partially Refunded",
  waived: "Waived",
};

/** Status badge variants using design tokens */
export const PAYMENT_STATUS_VARIANTS: Record<PaymentStatus, string> = {
  pending: "bg-warning/15 text-warning-foreground",
  recorded: "bg-success/15 text-[hsl(var(--success))]",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  refunded: "bg-info/15 text-[hsl(var(--info))]",
  partially_refunded: "bg-info/15 text-[hsl(var(--info))]",
  waived: "bg-accent text-accent-foreground",
};

/** Payment type labels */
export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  deposit: "Deposit",
  balance: "Balance",
  addon: "Add-on",
  security_deposit: "Security Deposit",
  booking_fee: "Booking Fee",
};

/** Provenance badge — how trustworthy is this payment record? */
export type PaymentProvenance = "verified_stripe" | "manual_recorded" | "unverified_legacy";

export interface ProvenanceBadge {
  kind: PaymentProvenance;
  label: string;
  icon: string; // emoji
  className: string;
  tooltip: string;
}

export function getPaymentProvenance(p: {
  provider?: string | null;
  method?: string | null;
  status?: string | null;
  provider_session_id?: string | null;
}): ProvenanceBadge {
  const provider = (p.provider || "").toLowerCase();
  const method = (p.method || "").toLowerCase();
  const hasStripeId = !!p.provider_session_id;

  // Verified: real online charge confirmed by webhook
  if ((provider === "stripe" || provider === "paddle") && (hasStripeId || p.status === "recorded")) {
    return {
      kind: "verified_stripe",
      label: "Verified Stripe",
      icon: "🟢",
      className: "bg-success/15 text-[hsl(var(--success))] border-0",
      tooltip: "Confirmed by payment provider webhook",
    };
  }

  // Legacy/risky: manual entry that claims card without Stripe proof
  if (method === "card" && provider !== "stripe" && provider !== "paddle") {
    return {
      kind: "unverified_legacy",
      label: "Unverified",
      icon: "🔴",
      className: "bg-destructive/10 text-destructive border-0",
      tooltip: "Manual card entry with no Stripe confirmation — review",
    };
  }

  // Manual offline (cash, bank_transfer, other)
  return {
    kind: "manual_recorded",
    label: "Manual recorded",
    icon: "🟡",
    className: "bg-warning/15 text-warning-foreground border-0",
    tooltip: "Staff-entered offline payment",
  };
}

/** Whether a payment status counts as "money received" */
export function isPaymentReceived(status: string): boolean {
  return status === "recorded" || status === "partially_refunded";
}

/** Calculate outstanding balance for a booking */
export function calculateOutstanding(
  totalPrice: number | null,
  payments: Array<{ amount: number; status: string; refund_amount?: number | null }>
): { totalPaid: number; totalRefunded: number; outstanding: number } {
  const totalPaid = payments
    .filter((p) => isPaymentReceived(p.status))
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const totalRefunded = payments
    .filter((p) => p.status === "refunded" || p.status === "partially_refunded")
    .reduce((sum, p) => sum + Number(p.refund_amount ?? 0), 0);

  const outstanding = (totalPrice ?? 0) - totalPaid + totalRefunded;

  return { totalPaid, totalRefunded, outstanding: Math.max(0, outstanding) };
}

type PaymentRow = {
  amount: number;
  status: string;
  payment_type?: string | null;
  refund_amount?: number | null;
  provider?: string | null;
};

function sumReceived(rows: PaymentRow[], type: string): number {
  return rows
    .filter((p) => (p.payment_type ?? "deposit") === type && isPaymentReceived(p.status))
    .reduce((sum, p) => sum + Number(p.amount) - Number(p.refund_amount ?? 0), 0);
}

function sumPending(rows: PaymentRow[], type: string): number {
  return rows
    .filter((p) => (p.payment_type ?? "deposit") === type && p.status === "pending")
    .reduce((sum, p) => sum + Number(p.amount), 0);
}

/**
 * Full breakdown of a booking's money, bucketed by payment_type.
 * Used by the Financial Summary Card and reconciliation views.
 */
export function calculateBookingFinancials(
  totalPrice: number | null,
  payments: PaymentRow[],
  opts?: { depositPercentage?: number; securityDepositAmount?: number; securityDepositRequired?: boolean }
) {
  const total = Number(totalPrice ?? 0);
  const depositPct = opts?.depositPercentage ?? 20;
  const secRequired = opts?.securityDepositRequired ?? false;
  const secAmount = secRequired ? Number(opts?.securityDepositAmount ?? 0) : 0;

  const depositRequired = total > 0 ? Math.round(total * depositPct) / 100 : 0;
  const balanceRequired = Math.max(0, total - depositRequired);

  const depositPaid = sumReceived(payments, "deposit");
  const balancePaid = sumReceived(payments, "balance");
  const securityPaid = sumReceived(payments, "security_deposit");

  const depositPending = sumPending(payments, "deposit");
  const balancePending = sumPending(payments, "balance");
  const securityPending = sumPending(payments, "security_deposit");

  const totalRefunded = payments
    .filter((p) => p.status === "refunded" || p.status === "partially_refunded")
    .reduce((s, p) => s + Number(p.refund_amount ?? 0), 0);

  const bookingCollected = depositPaid + balancePaid;
  const totalCollected = bookingCollected + securityPaid;
  const outstanding = Math.max(0, total - bookingCollected);
  const securityOutstanding = Math.max(0, secAmount - securityPaid);

  const depositStatus: "paid" | "partial" | "pending" | "not_required" =
    depositRequired <= 0 ? "not_required"
      : depositPaid >= depositRequired ? "paid"
      : depositPaid > 0 ? "partial" : "pending";

  const balanceStatus: "paid" | "partial" | "pending" =
    balancePaid >= balanceRequired && balanceRequired > 0 ? "paid"
      : balancePaid > 0 ? "partial" : "pending";

  const securityStatus: "paid" | "partial" | "pending" | "not_required" =
    !secRequired || secAmount <= 0 ? "not_required"
      : securityPaid >= secAmount ? "paid"
      : securityPaid > 0 ? "partial" : "pending";

  const overallStatus: "paid_in_full" | "deposit_received" | "awaiting_payment" | "refunded" =
    totalRefunded >= bookingCollected && bookingCollected > 0 ? "refunded"
      : outstanding <= 0 && total > 0 ? "paid_in_full"
      : depositPaid >= depositRequired && depositRequired > 0 ? "deposit_received"
      : "awaiting_payment";

  const hasVerified = payments.some(
    (p) => isPaymentReceived(p.status) && p.provider === "stripe"
  );
  const hasManual = payments.some(
    (p) => isPaymentReceived(p.status) && p.provider !== "stripe" && p.provider !== "pending"
  );
  const trustStatus: "verified" | "mixed" | "manual_only" | "none" =
    bookingCollected <= 0 ? "none"
      : hasVerified && hasManual ? "mixed"
      : hasVerified ? "verified"
      : "manual_only";

  return {
    total,
    depositRequired,
    depositPaid,
    depositPending,
    depositStatus,
    balanceRequired,
    balancePaid,
    balancePending,
    balanceStatus,
    securityRequired: secAmount,
    securityPaid,
    securityPending,
    securityStatus,
    securityOutstanding,
    totalRefunded,
    bookingCollected,
    totalCollected,
    outstanding,
    overallStatus,
    trustStatus,
  };
}
