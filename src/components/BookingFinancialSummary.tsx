import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/currency";
import { calculateBookingFinancials } from "@/lib/paymentTypes";
import { Check, Clock, AlertCircle, ShieldCheck, ShieldAlert, Shield } from "lucide-react";

interface Props {
  bookingId: string;
  totalPrice: number | null;
  propertyId?: string | null;
  canSeeAmounts?: boolean;
}

function readPolicy(rows: any[] | undefined, key: string, propertyId?: string | null) {
  if (!rows) return undefined;
  // Property-scoped first, then global
  const scoped = rows.find((r) => r.key === key && r.property_id === propertyId);
  const global = rows.find((r) => r.key === key && (r.property_id == null));
  const row = scoped ?? global;
  if (!row) return undefined;
  const raw = typeof row.value === "string" ? row.value.replace(/^"|"$/g, "") : row.value;
  return raw;
}

function StatusPill({ status }: { status: "paid" | "partial" | "pending" | "not_required" }) {
  if (status === "not_required") return <span className="text-xs text-muted-foreground">—</span>;
  if (status === "paid") return <Badge className="gap-1 bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-0 text-[10px] px-1.5 py-0"><Check className="h-2.5 w-2.5" />Paid</Badge>;
  if (status === "partial") return <Badge className="gap-1 bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-0 text-[10px] px-1.5 py-0"><Clock className="h-2.5 w-2.5" />Partial</Badge>;
  return <Badge className="gap-1 bg-muted text-muted-foreground border-0 text-[10px] px-1.5 py-0"><Clock className="h-2.5 w-2.5" />Pending</Badge>;
}

function TrustPill({ trust }: { trust: "verified" | "mixed" | "manual_only" | "none" }) {
  if (trust === "verified") return <Badge className="gap-1 bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-0"><ShieldCheck className="h-3 w-3" />Verified Stripe</Badge>;
  if (trust === "mixed") return <Badge className="gap-1 bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-0"><Shield className="h-3 w-3" />Mixed</Badge>;
  if (trust === "manual_only") return <Badge className="gap-1 bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-0"><ShieldAlert className="h-3 w-3" />Manual recorded</Badge>;
  return <Badge variant="outline" className="text-xs">No payments yet</Badge>;
}

const OVERALL_LABEL: Record<string, { text: string; cls: string }> = {
  paid_in_full: { text: "Paid in full", cls: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]" },
  credit_due: { text: "Credit on file", cls: "bg-[hsl(var(--info))]/15 text-[hsl(var(--info))]" },
  deposit_received: { text: "Deposit received", cls: "bg-primary/15 text-primary" },
  awaiting_payment: { text: "Awaiting payment", cls: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]" },
  refunded: { text: "Refunded", cls: "bg-muted text-muted-foreground" },
};


export function BookingFinancialSummary({ bookingId, totalPrice, propertyId, canSeeAmounts = true }: Props) {
  const { data: payments } = useQuery({
    queryKey: ["booking-financials-payments", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("amount, status, payment_type, refund_amount, provider")
        .eq("booking_id", bookingId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: policies } = useQuery({
    queryKey: ["booking-financials-policies", propertyId ?? "global"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("policy_settings")
        .select("*")
        .in("key", [
          "deposit_percentage",
          "security_deposit_required", "security_deposit_amount",
          "currency_symbol",
          "booking_fee_enabled", "booking_fee_mode",
          "booking_fee_percentage", "booking_fee_fixed",
        ]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const fin = useMemo(() => {
    const pct = Number(readPolicy(policies, "deposit_percentage", propertyId) ?? 20);
    const secReq = String(readPolicy(policies, "security_deposit_required", propertyId) ?? "false") === "true";
    const secAmt = Number(readPolicy(policies, "security_deposit_amount", propertyId) ?? 0);
    const feeEnabled = String(readPolicy(policies, "booking_fee_enabled", propertyId) ?? "false") === "true";
    const feeMode = (readPolicy(policies, "booking_fee_mode", propertyId) ?? "separate") as "included" | "separate" | "hidden";
    const feePct = Number(readPolicy(policies, "booking_fee_percentage", propertyId) ?? 0);
    const feeFixed = Number(readPolicy(policies, "booking_fee_fixed", propertyId) ?? 0);
    return calculateBookingFinancials(totalPrice, payments ?? [], {
      depositPercentage: pct,
      securityDepositRequired: secReq,
      securityDepositAmount: secAmt,
      bookingFeeEnabled: feeEnabled,
      bookingFeeMode: feeMode,
      bookingFeePercentage: feePct,
      bookingFeeFixed: feeFixed,
    });
  }, [totalPrice, payments, policies, propertyId]);

  if (!canSeeAmounts) return null;

  const fmt = (n: number) => formatPrice(n, policies);
  const overall = OVERALL_LABEL[fin.overallStatus] ?? OVERALL_LABEL.awaiting_payment;


  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Money</span>
            <Badge className={`text-xs border-0 ${overall.cls}`}>{overall.text}</Badge>
          </div>
          <TrustPill trust={fin.trustStatus} />
        </div>

        {/* Big numbers — Total / Collected / Outstanding */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Booking total</div>
            <div className="text-base font-semibold tabular-nums">{fmt(fin.grandTotal)}</div>
            {fin.addonRequired > 0 && (
              <div className="text-[10px] text-muted-foreground">incl. {fmt(fin.addonRequired)} add-ons</div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Collected</div>
            <div className="text-base font-semibold tabular-nums text-[hsl(var(--success))]">{fmt(fin.bookingCollected)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">
              {fin.credit > 0 ? "Credit" : fin.outstanding > 0 ? "Outstanding" : "Balance"}
            </div>
            <div
              className={`text-base font-semibold tabular-nums ${
                fin.credit > 0
                  ? "text-[hsl(var(--info))]"
                  : fin.outstanding > 0
                    ? "text-destructive"
                    : "text-[hsl(var(--success))]"
              }`}
            >
              {fin.credit > 0 ? fmt(fin.credit) : fin.outstanding > 0 ? fmt(fin.outstanding) : fmt(0)}
            </div>
            {fin.credit > 0 && (
              <div className="text-[10px] text-muted-foreground">Overpaid — credit on file</div>
            )}
          </div>

        </div>


        {/* Breakdown rows */}
        <div className="space-y-1.5 pt-2 border-t border-border/50 text-sm">
          <Row
            label="Deposit"
            required={fin.depositRequired}
            paid={fin.depositPaid}
            status={fin.depositStatus}
            fmt={fmt}
          />
          <Row
            label="Remaining balance"
            required={fin.balanceRequired}
            paid={fin.balancePaid}
            status={fin.balanceStatus}
            fmt={fmt}
          />
          {fin.securityStatus !== "not_required" && (
            <Row
              label="Security deposit"
              required={fin.securityRequired}
              paid={fin.securityPaid}
              status={fin.securityStatus}
              fmt={fmt}
              hint="Held separately — refundable"
            />
          )}
          {fin.addonStatus !== "not_required" && (
            <Row
              label="Add-ons (airport pickup, extras)"
              required={fin.addonRequired}
              paid={fin.addonCovered}
              status={fin.addonStatus}
              fmt={fmt}
              hint={
                fin.addonWaived > 0
                  ? fin.credit > 0
                    ? "Covered by booking credit"
                    : "Collected with the balance payment"
                  : "Billed on top of the room total"
              }

            />
          )}
          {fin.feeStatus !== "not_required" && (
            <Row
              label="Booking fee"
              required={fin.feeRequired}
              paid={fin.feePaid}
              status={fin.feeStatus}
              fmt={fmt}
              hint={fin.feeMode === "hidden" ? "Internal only" : undefined}
            />
          )}

          {fin.totalRefunded > 0 && (
            <div className="flex items-center justify-between text-xs text-[hsl(var(--info))] pt-1">
              <span>↩ Refunded</span>
              <span className="tabular-nums">−{fmt(fin.totalRefunded)}</span>
            </div>
          )}
        </div>

        {/* Footer total collected (incl. security + fee) */}
        {(fin.securityPaid > 0 || fin.feePaid > 0) && (
          <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/50 pt-2">
            <span>Total in hand (incl. security & fees)</span>
            <span className="font-medium text-foreground tabular-nums">{fmt(fin.totalCollected)}</span>
          </div>
        )}

        {fin.overallStatus === "awaiting_payment" && fin.bookingCollected === 0 && (
          <div className="flex items-center gap-2 text-xs text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 rounded-md px-2 py-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>No money in yet. Send the deposit link from the Payments tab.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  label, required, paid, status, fmt, hint,
}: {
  label: string;
  required: number;
  paid: number;
  status: "paid" | "partial" | "pending" | "not_required";
  fmt: (n: number) => string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm">{label}</span>
        <StatusPill status={status} />
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm tabular-nums">
          <span className={paid >= required && required > 0 ? "text-[hsl(var(--success))] font-medium" : ""}>{fmt(paid)}</span>
          <span className="text-muted-foreground"> / {fmt(required)}</span>
        </div>
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}
