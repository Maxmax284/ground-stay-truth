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
  | "security_deposit"; // Damage deposit

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
};

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
