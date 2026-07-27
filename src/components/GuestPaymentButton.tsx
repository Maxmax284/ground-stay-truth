import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GuestPaymentButtonProps {
  bookingId: string;
  depositAmount: number | null;
  currencySymbol?: string;
}

export function GuestPaymentButton({ bookingId, depositAmount, currencySymbol = "฿" }: GuestPaymentButtonProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    // Stripe session creation can take a few seconds (cold start + Stripe API).
    // Tell the guest something is happening instead of leaving a silent spinner,
    // and hard-stop after 25s so the button can never hang forever.
    const pendingToast = toast.loading(
      t("deposit.openingCheckout", "Opening secure checkout — this can take a few seconds..."),
    );
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25_000);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in to continue");
        return;
      }

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-payment`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            booking_id: bookingId,
            success_url: `${window.location.origin}/guest?payment=success`,
            cancel_url: `${window.location.origin}/guest?payment=cancelled`,
          }),
        }
      );


      const data = await resp.json();

      if (!resp.ok) {
        // Distinct, honest messaging. Never say "online payments unavailable"
        // when the real problem is stale booking state or a setup issue the
        // front desk can resolve with a payment link.
        if (data.error === "stripe_not_live_safe") {
          toast.error(
            t(
              "deposit.tempUnavailable",
              "Card payment is temporarily unavailable. Please contact the front desk and we'll send you a payment link.",
            ),
          );
        } else if (
          data.error === "online_payments_unavailable" ||
          data.error === "Online payments not configured" ||
          data.error === "Stripe not configured"
        ) {
          toast.error(t("deposit.onlineNotConfigured", "Online payments are not available yet. Please contact the front desk."));
        } else if (data.error === "Booking is not awaiting deposit") {
          toast.error(t("deposit.sessionExpired", "This booking session has expired or the status has changed. Please refresh and try again."));
        } else if (data.error === "Payment already recorded") {
          toast.error(t("deposit.alreadyPaid", "A payment has already been recorded for this booking."));
        } else {
          toast.error(data.message || data.error || "Payment failed");
        }
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      toast.error(err.message || "Payment failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handlePay}
      disabled={loading}
      className="w-full gap-2"
      size="sm"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <CreditCard className="h-4 w-4" />
      )}
      {loading
        ? t("common.pleaseWait", "Please wait...")
        : t("deposit.payOnline", "Pay Deposit Online")}
      {depositAmount != null && !loading && (
        <span className="font-semibold ml-1">
          {currencySymbol}{depositAmount.toFixed(0)}
        </span>
      )}
    </Button>
  );
}
