import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/currency";
import { PAYMENT_STATUS_LABELS, PAYMENT_TYPE_LABELS, type PaymentStatus, type PaymentType } from "@/lib/paymentTypes";
import { StepUpDialog } from "@/components/security/StepUpDialog";
import { useMfaPolicy, isStepUpFresh } from "@/hooks/useMfa";

interface RefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: {
    id: string;
    amount: number;
    status: string;
    payment_type: string;
    refund_amount?: number | null;
  } | null;
  policies?: any[];
  onConfirm: (paymentId: string, refundAmount: number, reason: string) => Promise<void>;
  isPending: boolean;
}

export function RefundDialog({ open, onOpenChange, payment, policies, onConfirm, isPending }: RefundDialogProps) {
  const { t } = useTranslation();
  const [refundAmount, setRefundAmount] = useState("");
  const [reason, setReason] = useState("");
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const policy = useMfaPolicy();

  if (!payment) return null;

  const alreadyRefunded = Number(payment.refund_amount ?? 0);
  const maxRefundable = Number(payment.amount) - alreadyRefunded;
  const currentAmount = Number(refundAmount) || 0;
  const isValid = currentAmount > 0 && currentAmount <= maxRefundable && reason.trim().length > 0;
  const isFullRefund = currentAmount === Number(payment.amount) && alreadyRefunded === 0;

  const doConfirm = async () => {
    await onConfirm(payment.id, currentAmount, reason.trim());
    setRefundAmount("");
    setReason("");
    onOpenChange(false);
  };

  const handleConfirm = async () => {
    if (!isValid) return;
    if (policy.requireForSensitiveActions && !isStepUpFresh()) {
      setStepUpOpen(true);
      return;
    }
    await doConfirm();
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setRefundAmount("");
      setReason("");
    }
    onOpenChange(v);
  };

  return (
    <>
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("payments.issueRefund", { defaultValue: "Issue Refund" })}</AlertDialogTitle>
          <AlertDialogDescription>
            {(payment as any).provider === "stripe"
              ? t("payments.refundDescriptionStripe", { defaultValue: "Stripe will be charged immediately. The database record updates only after Stripe confirms the refund." })
              : t("payments.refundDescriptionManual", { defaultValue: "Manual refund — this updates the database record only. No provider will be charged. Process the actual refund separately." })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          {/* Payment summary */}
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("payments.originalAmount", { defaultValue: "Original Amount" })}</span>
              <span className="font-semibold">{formatPrice(payment.amount, policies)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px]">{PAYMENT_TYPE_LABELS[payment.payment_type as PaymentType] ?? payment.payment_type}</Badge>
              <Badge className="text-[10px] border-0 bg-muted text-muted-foreground">{PAYMENT_STATUS_LABELS[payment.status as PaymentStatus] ?? payment.status}</Badge>
            </div>
            {alreadyRefunded > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("payments.alreadyRefunded", { defaultValue: "Already Refunded" })}</span>
                <span className="font-medium text-[hsl(var(--info))]">{formatPrice(alreadyRefunded, policies)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("payments.maxRefundable", { defaultValue: "Max Refundable" })}</span>
              <span className="font-semibold">{formatPrice(maxRefundable, policies)}</span>
            </div>
          </div>

          {/* Refund amount */}
          <div className="space-y-1.5">
            <Label className="text-sm">{t("payments.refundAmount", { defaultValue: "Refund Amount" })} *</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={maxRefundable}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              placeholder={maxRefundable.toFixed(2)}
            />
            {currentAmount > maxRefundable && (
              <p className="text-xs text-destructive">{t("payments.exceedsMax", { defaultValue: "Exceeds maximum refundable amount" })}</p>
            )}
            {isFullRefund && <p className="text-xs text-[hsl(var(--info))]">{t("payments.fullRefundNote", { defaultValue: "This will be a full refund" })}</p>}
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label className="text-sm">{t("payments.refundReason", { defaultValue: "Reason" })} *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("payments.refundReasonPlaceholder", { defaultValue: "Explain why this refund is being issued..." })}
              rows={2}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t("common.cancel", { defaultValue: "Cancel" })}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleConfirm(); }}
            disabled={!isValid || isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? t("common.processing", { defaultValue: "Processing..." }) : t("payments.confirmRefund", { defaultValue: "Confirm Refund" })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <StepUpDialog
      open={stepUpOpen}
      onOpenChange={setStepUpOpen}
      action="issuing this refund"
      onVerified={doConfirm}
    />
    </>
  );
}
