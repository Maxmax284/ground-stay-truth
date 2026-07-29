import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, CreditCard, Receipt } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import {
  calculateOutstanding,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_VARIANTS,
  PAYMENT_TYPE_LABELS,
  type PaymentStatus,
  type PaymentType,
} from "@/lib/paymentTypes";

interface GuestPaymentSummaryProps {
  bookingId: string;
  totalPrice: number | null;
  policies?: any[];
}

export function GuestPaymentSummary({ bookingId, totalPrice, policies }: GuestPaymentSummaryProps) {
  const { t } = useTranslation();

  const { data: payments } = useQuery({
    queryKey: ["guest-payments", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, status, payment_type, method, provider, created_at, receipt_url, refund_amount, refund_reason, description")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const balance = useMemo(
    () => calculateOutstanding(totalPrice, payments ?? []),
    [totalPrice, payments]
  );

  // Only show confirmed/visible payments (not pending or failed) for balance display
  const visiblePayments = payments?.filter((p) => !["cancelled"].includes(p.status)) ?? [];

  if (!payments || payments.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <CreditCard className="h-4 w-4 text-primary" />
        {t("payments.paymentSummary", { defaultValue: "Payment Summary" })}
      </div>

      {/* Balance breakdown */}
      {totalPrice != null && (
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("payments.totalStayCost", { defaultValue: "Total Stay Cost" })}</span>
            <span className="font-medium">{formatPrice(totalPrice, policies)}</span>
          </div>
          {balance.addonTotal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("payments.addonsLabel", { defaultValue: "Add-ons (airport pickup, extras)" })}</span>
              <span className="font-medium">{formatPrice(balance.addonTotal, policies)}</span>
            </div>
          )}

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("payments.totalPaid", { defaultValue: "Total Paid" })}</span>
            <span className="font-medium text-[hsl(var(--success))]">{formatPrice(balance.totalPaid, policies)}</span>
          </div>
          {balance.totalRefunded > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("payments.totalRefunded", { defaultValue: "Refunded" })}</span>
              <span className="font-medium text-[hsl(var(--info))]">−{formatPrice(balance.totalRefunded, policies)}</span>
            </div>
          )}
          <Separator className="my-1" />
          <div className="flex justify-between text-sm">
            <span className="font-medium">{t("payments.outstanding", { defaultValue: "Outstanding" })}</span>
            <span className={`font-semibold ${balance.outstanding > 0 ? "text-destructive" : "text-[hsl(var(--success))]"}`}>
              {balance.outstanding > 0
                ? formatPrice(balance.outstanding, policies)
                : t("payments.fullyPaid", { defaultValue: "Fully Paid" })}
            </span>
          </div>
        </div>
      )}

      {/* Payment history */}
      {visiblePayments.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("payments.history", { defaultValue: "Payment History" })}
            </p>
            {visiblePayments.map((p) => {
              const statusLabel = PAYMENT_STATUS_LABELS[p.status as PaymentStatus] ?? p.status;
              const statusVariant = PAYMENT_STATUS_VARIANTS[p.status as PaymentStatus] ?? "bg-muted text-muted-foreground";
              const typeLabel = PAYMENT_TYPE_LABELS[p.payment_type as PaymentType] ?? p.payment_type;
              return (
                <div key={p.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">{formatPrice(p.amount, policies)}</span>
                      <Badge className={`text-[10px] border-0 ${statusVariant}`}>{statusLabel}</Badge>
                      <Badge variant="outline" className="text-[10px]">{typeLabel}</Badge>
                    </div>
                    {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                    {p.refund_amount != null && Number(p.refund_amount) > 0 && (
                      <p className="text-xs text-[hsl(var(--info))]">
                        ↩ {t("payments.refundLabel", { defaultValue: "Refund" })}: {formatPrice(p.refund_amount, policies)}
                        {p.refund_reason ? ` — ${p.refund_reason}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.receipt_url && (
                      <a
                        href={p.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 transition-colors"
                        title={t("payments.viewReceipt", { defaultValue: "View Receipt" })}
                      >
                        <Receipt className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <span className="text-xs text-muted-foreground">{format(new Date(p.created_at), "MMM d")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
