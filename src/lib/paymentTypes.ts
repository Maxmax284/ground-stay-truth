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

/**
 * Calculate outstanding balance for a booking.
 *
 * BUSINESS-CRITICAL: add-on obligations (airport pickup fee, transfers, extras)
 * are NOT part of `bookings.total_price` — they live as `payment_type = 'addon'`
 * rows. They are real money the guest owes, so they are folded into the amount
 * due here. A `waived` add-on means the money already came in bundled under a
 * balance payment, so it counts as both owed and covered (net zero).
 */
export function calculateOutstanding(
  totalPrice: number | null,
  payments: Array<{ amount: number; status: string; refund_amount?: number | null; payment_type?: string | null }>
): { totalPaid: number; totalRefunded: number; addonTotal: number; grandTotal: number; outstanding: number; credit: number } {
  const totalPaid = payments
    .filter((p) => isPaymentReceived(p.status))
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const totalRefunded = payments
    .filter((p) => p.status === "refunded" || p.status === "partially_refunded")
    .reduce((sum, p) => sum + Number(p.refund_amount ?? 0), 0);

  // Add-on obligations that are still live: awaiting payment, already paid,
  // or settled inside another payment (waived).
  const addonTotal = payments
    .filter(
      (p) =>
        (p.payment_type ?? "") === "addon" &&
        ["pending", "recorded", "partially_refunded", "waived"].includes(p.status)
    )
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const grandTotal = Math.round(((totalPrice ?? 0) + addonTotal) * 100) / 100;
  const rawOutstanding = grandTotal - totalPaid + totalRefunded;
  // Cash is handled in whole baht, but percentage discounts produce satang.
  // Anything under 1 baht either way is rounding dust, not a real balance —
  // treat it as settled so the desk doesn't chase 34 satang.
  const outstanding = Math.abs(rawOutstanding) < 1 ? 0 : rawOutstanding;

  return {
    totalPaid,
    totalRefunded,
    addonTotal: Math.round(addonTotal * 100) / 100,
    grandTotal,
    outstanding: Math.max(0, Math.round(outstanding * 100) / 100),
    /** Overpayment sitting on the booking. Never negative. */
    credit: Math.max(0, Math.round(-outstanding * 100) / 100),
  };
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
  opts?: {
    depositPercentage?: number;
    securityDepositAmount?: number;
    securityDepositRequired?: boolean;
    bookingFeeEnabled?: boolean;
    bookingFeeMode?: "included" | "separate" | "hidden";
    bookingFeePercentage?: number;
    bookingFeeFixed?: number;
  }
) {
  const total = Number(totalPrice ?? 0);
  const depositPct = opts?.depositPercentage ?? 20;
  const secRequired = opts?.securityDepositRequired ?? false;
  const secAmount = secRequired ? Number(opts?.securityDepositAmount ?? 0) : 0;

  const feeEnabled = opts?.bookingFeeEnabled ?? false;
  const feeMode = opts?.bookingFeeMode ?? "separate";
  const feePct = Number(opts?.bookingFeePercentage ?? 0);
  const feeFixed = Number(opts?.bookingFeeFixed ?? 0);
  // "included" mode: fee is rolled into total_price, no separate obligation
  const feeRequired = feeEnabled && feeMode !== "included"
    ? Math.round(((total * feePct) / 100 + feeFixed) * 100) / 100
    : 0;

  const depositRequired = total > 0 ? Math.round(total * depositPct) / 100 : 0;
  const balanceRequired = Math.max(0, total - depositRequired);

  const recordedDepositPaid = sumReceived(payments, "deposit");
  const recordedBalancePaid = sumReceived(payments, "balance");
  const securityPaid = sumReceived(payments, "security_deposit");
  const feePaid = sumReceived(payments, "booking_fee");
  const addonPaid = sumReceived(payments, "addon");

  // Room money is fungible once received. Legacy and front-desk payments are
  // often recorded entirely as `balance`, so present all room money through the
  // normal waterfall: deposit first, then remaining balance. The ledger keeps
  // its original labels; this only stops a paid deposit from looking unpaid.
  const roomCollected = recordedDepositPaid + recordedBalancePaid;
  const depositPaid = Math.min(depositRequired, roomCollected);
  const balancePaid = Math.min(balanceRequired, Math.max(0, roomCollected - depositRequired));

  const depositPending = sumPending(payments, "deposit");
  const balancePending = sumPending(payments, "balance");
  const securityPending = sumPending(payments, "security_deposit");
  const feePending = sumPending(payments, "booking_fee");
  const addonPending = sumPending(payments, "addon");

  // Add-ons bundled into a balance/full payment link are settled by marking the
  // standalone obligation as `waived` (the money already came in under
  // payment_type='balance'). Count them as covered for display, but never add
  // them to collected totals — that would double-count the same baht.
  const addonWaived = payments
    .filter((p) => (p.payment_type ?? "deposit") === "addon" && p.status === "waived")
    .reduce((s, p) => s + Number(p.amount), 0);

  // Add-ons (airport pickup, transfers, extras) are real obligations created as
  // payment rows — the required amount is whatever is pending plus what's paid.
  const addonRequired = Math.round((addonPaid + addonPending + addonWaived) * 100) / 100;

  const totalRefunded = payments
    .filter((p) => p.status === "refunded" || p.status === "partially_refunded")
    .reduce((s, p) => s + Number(p.refund_amount ?? 0), 0);

  const bookingCollected = recordedDepositPaid + recordedBalancePaid + addonPaid;
  const totalCollected = bookingCollected + securityPaid + feePaid;
  const grandTotal = Math.round((total + addonRequired) * 100) / 100;

  // Staff often take one lump cash/transfer that already includes the add-on and
  // record it as `balance`, leaving the standalone add-on row `pending`. If the
  // money in hand covers the whole grand total, the add-on is settled — don't
  // keep shouting "Awaiting payment" at staff for baht already collected.
  const addonAbsorbed = Math.max(
    0,
    Math.min(addonRequired, Math.round((bookingCollected - total) * 100) / 100)
  );
  const addonCovered = Math.round(Math.max(addonPaid + addonWaived, addonAbsorbed) * 100) / 100;

  const outstanding = Math.max(0, grandTotal - bookingCollected);
  const securityOutstanding = Math.max(0, secAmount - securityPaid);
  const feeOutstanding = Math.max(0, feeRequired - feePaid);
  const addonOutstanding = Math.max(0, Math.round((addonRequired - addonCovered) * 100) / 100);

  // Overpayment: money in hand against the booking beyond what the booking owes.
  // Surfaced so staff see "Credit ฿X" instead of a blank dash.
  const credit = Math.max(0, Math.round((bookingCollected - grandTotal) * 100) / 100);




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

  const feeStatus: "paid" | "partial" | "pending" | "not_required" =
    feeRequired <= 0 ? "not_required"
      : feePaid >= feeRequired ? "paid"
      : feePaid > 0 ? "partial" : "pending";

  const addonStatus: "paid" | "partial" | "pending" | "not_required" =
    addonRequired <= 0 ? "not_required"
      : addonCovered >= addonRequired ? "paid"
      : addonCovered > 0 ? "partial" : "pending";

  const overallStatus: "paid_in_full" | "credit_due" | "deposit_received" | "awaiting_payment" | "refunded" =
    totalRefunded >= bookingCollected && bookingCollected > 0 ? "refunded"
      : credit > 0 ? "credit_due"
      : outstanding <= 0 && grandTotal > 0 ? "paid_in_full"
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
    grandTotal,
    addonRequired,
    addonPaid,
    addonPending,
    addonWaived,
    addonCovered,
    addonStatus,
    addonOutstanding,
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
    feeRequired,
    feePaid,
    feePending,
    feeStatus,
    feeOutstanding,
    feeMode,
    feeEnabled,
    totalRefunded,
    bookingCollected,
    totalCollected,
    outstanding,
    credit,
    overallStatus,

    trustStatus,
  };
}
