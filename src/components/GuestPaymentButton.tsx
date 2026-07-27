import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logGuestPortalEvent } from "@/lib/guestPortalTelemetry";
import { GuestRecoveryNotice } from "@/components/GuestRecoveryNotice";

interface GuestPaymentButtonProps {
  bookingId: string;
  depositAmount: number | null;
  currencySymbol?: string;
}

/** If the browser hasn't left the page this long after we set location, the
 *  redirect was blocked (in-app browsers do this) — surface a manual link. */
const REDIRECT_STALL_MS = 6000;

export function GuestPaymentButton({ bookingId, depositAmount, currencySymbol = "฿" }: GuestPaymentButtonProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [recovery, setRecovery] = useState<{ message: string; url?: string | null } | null>(null);
  const loadingRef = useRef(false);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  const handlePay = useCallback(async (trigger: "button" | "auto" = "button") => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setRecovery(null);
    setLoading(true);

    logGuestPortalEvent({
      event: "checkout_button_clicked",
      bookingId,
      component: "GuestPaymentButton",
      action: trigger,
      metadata: { deposit_amount: depositAmount },
    });
    // Stripe session creation can take a few seconds (cold start + Stripe API).
    // Tell the guest something is happening instead of leaving a silent spinner,
    // and hard-stop after 25s so the button can never hang forever.
    const pendingToast = toast.loading(
      t("deposit.openingCheckout", "Opening secure checkout — this can take a few seconds..."),
    );
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25_000);
    const startedAt = Date.now();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in to continue");
        logGuestPortalEvent({
          event: "checkout_create_failed",
          bookingId,
          component: "GuestPaymentButton",
          errorCode: "no_session",
          errorMessage: "No active auth session",
        });
        return;
      }

      logGuestPortalEvent({
        event: "checkout_create_started",
        bookingId,
        component: "GuestPaymentButton",
      });


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
        logGuestPortalEvent({
          event: "checkout_create_failed",
          bookingId,
          component: "GuestPaymentButton",
          errorCode: String(data.error ?? resp.status),
          errorMessage: String(data.message ?? data.error ?? `HTTP ${resp.status}`),
          metadata: { http_status: resp.status, elapsed_ms: Date.now() - startedAt },
        });
        // Distinct, honest messaging. Never say "online payments unavailable"
        // when the real problem is stale booking state or a setup issue the
        // front desk can resolve with a payment link.
        let message: string;
        if (data.error === "stripe_not_live_safe") {
          message = t(
            "deposit.tempUnavailable",
            "Card payment is temporarily unavailable. Please contact the front desk and we'll send you a payment link.",
          );
        } else if (
          data.error === "online_payments_unavailable" ||
          data.error === "Online payments not configured" ||
          data.error === "Stripe not configured"
        ) {
          message = t("deposit.onlineNotConfigured", "Online payments are not available yet. Please contact the front desk.");
        } else if (data.error === "Booking is not awaiting deposit") {
          message = t("deposit.sessionExpired", "This booking session has expired or the status has changed. Please refresh and try again.");
        } else if (data.error === "Payment already recorded") {
          message = t("deposit.alreadyPaid", "A payment has already been recorded for this booking.");
        } else {
          message = data.message || data.error || "Payment failed";
        }
        toast.error(message);
        // Keep the reason on screen after the toast fades, with a retry.
        setRecovery({ message });
        return;
      }


      if (data.url) {
        logGuestPortalEvent({
          event: "checkout_create_success",
          bookingId,
          status: "ok",
          component: "GuestPaymentButton",
          metadata: { elapsed_ms: Date.now() - startedAt },
        });
        logGuestPortalEvent({
          event: "checkout_redirect_started",
          bookingId,
          status: "ok",
          component: "GuestPaymentButton",
        });
        // Keep the spinner up through the redirect — resetting it makes the
        // page look idle while the browser is already navigating to Stripe.
        window.location.href = data.url;
        return;
      }
      logGuestPortalEvent({
        event: "checkout_create_failed",
        bookingId,
        component: "GuestPaymentButton",
        errorCode: "no_checkout_url",
        errorMessage: "Provider returned no checkout URL",
      });
      toast.error(t("deposit.noCheckoutUrl", "Checkout could not be opened. Please contact the front desk."));
    } catch (err: any) {
      if (err?.name === "AbortError") {
        logGuestPortalEvent({
          event: "checkout_timeout",
          bookingId,
          component: "GuestPaymentButton",
          errorCode: "timeout",
          errorMessage: "Checkout creation exceeded 25s",
          metadata: { elapsed_ms: Date.now() - startedAt },
        });
        toast.error(
          t(
            "deposit.checkoutTimeout",
            "Checkout is taking longer than usual. Please check your connection and try again, or contact the front desk for a payment link.",
          ),
        );
      } else {
        logGuestPortalEvent({
          event: "guest_network_error",
          bookingId,
          component: "GuestPaymentButton",
          errorCode: "network",
          errorMessage: String(err?.message ?? "Network error"),
        });
        toast.error(err.message || "Payment failed");
      }
    } finally {
      clearTimeout(timeoutId);
      toast.dismiss(pendingToast);
      loadingRef.current = false;
      setLoading(false);
    }
  }, [bookingId, depositAmount, t]);

  // The summary card's "Pay Deposit" shortcut fires this event after scrolling
  // to the deposit block, so one tap actually starts checkout instead of just
  // moving the page. Only the matching booking's button responds.
  useEffect(() => {
    const onAuto = (e: Event) => {
      const detail = (e as CustomEvent).detail as { bookingId?: string } | undefined;
      if (detail?.bookingId && detail.bookingId !== bookingId) return;
      void handlePay("auto");
    };
    window.addEventListener("guest-start-deposit-checkout", onAuto as EventListener);
    return () => window.removeEventListener("guest-start-deposit-checkout", onAuto as EventListener);
  }, [bookingId, handlePay]);


  return (
    <Button
      onClick={() => handlePay("button")}

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
