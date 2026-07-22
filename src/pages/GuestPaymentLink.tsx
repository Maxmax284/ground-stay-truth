import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { logClientError } from "@/lib/errorLogging";

// Backend-truth statuses returned by guest-payment-link `lookup` action.
type LookupStatus =
  | "loading"
  | "ok"
  | "expired"
  | "already_paid"
  | "revoked"
  | "invalid"
  | "error";
// Payment status derived from polling the `status` action after checkout.
type PayStatus = "idle" | "confirming" | "recorded" | "timeout";

interface Summary {
  unit_name: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  amount: number;
  currency: string;
  expires_at: string;
  booking_state: string;
}

const POLL_MS = 2000;
const POLL_TIMEOUT_MS = 30_000;

/**
 * In-app browsers (WhatsApp, Instagram, Facebook) often break redirects,
 * cookies, and post-network flows. Detect them so we can nudge the guest
 * toward the system browser where the payment chain is reliable.
 */
function detectInAppBrowser(): { isInApp: boolean; label: string } {
  const ua =
    typeof navigator !== "undefined"
      ? navigator.userAgent || navigator.vendor || (window as any).opera || ""
      : "";
  const lower = ua.toLowerCase();
  if (lower.includes("whatsapp")) return { isInApp: true, label: "WhatsApp" };
  if (lower.includes("instagram")) return { isInApp: true, label: "Instagram" };
  if (
    lower.includes("fb_iab") ||
    lower.includes("fb4a") ||
    lower.includes("facebook")
  )
    return { isInApp: true, label: "Facebook" };
  return { isInApp: false, label: "" };
}

export default function GuestPaymentLink() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const urlStatus = params.get("status");

  const [status, setStatus] = useState<LookupStatus>("loading");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [payStatus, setPayStatus] = useState<PayStatus>("idle");
  const pollStartRef = useRef<number | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [inAppInfo, setInAppInfo] = useState(detectInAppBrowser());

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guest-payment-link`;
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  useEffect(() => {
    setInAppInfo(detectInAppBrowser());
  }, []);

  /**
   * Initial lookup + optional verify-on-return. Wrapped in a callback so the
   * same path can be retried after a network hiccup without reloading the page.
   */
  const runLookup = useCallback(async () => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      if (urlStatus === "success") {
        // Kick the webhook fallback verifier once. It's idempotent.
        try {
          await fetch(fnUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey },
            body: JSON.stringify({ action: "verify", token }),
          });
        } catch {
          /* swallow — polling below is the source of truth */
        }
      }

      const resp = await fetch(fnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey },
        body: JSON.stringify({ action: "lookup", token }),
      });
      const data = await resp.json();
      if (data.summary) setSummary(data.summary);
      if (data.status === "ok") setStatus("ok");
      else if (data.status === "expired") setStatus("expired");
      else if (data.status === "already_paid") setStatus("already_paid");
      else if (data.status === "revoked") setStatus("revoked");
      else setStatus("invalid");
    } catch (err: any) {
      const message = err.message || "Network error";
      setErrorMsg(message);
      setStatus("error");
      console.error("[GuestPaymentLink] lookup failed", {
        token,
        urlStatus,
        userAgent: navigator.userAgent,
        error: message,
      });
      void logClientError({
        action: "guest-payment-link:lookup",
        category: "network_error",
        failureReason: message,
        details: {
          token,
          urlStatus,
          userAgent: navigator.userAgent,
        },
      });
    }
  }, [token, fnUrl, apikey, urlStatus]);

  useEffect(() => {
    runLookup();
  }, [runLookup, retryTick]);

  /**
   * Poll payment status after redirect-back from Stripe. The URL alone is not
   * proof of payment — we only trust the DB row. Polling survives transient
   * network failures (common in in-app browsers) and only surfaces a timeout
   * after the full window has elapsed.
   */
  useEffect(() => {
    if (urlStatus !== "success" || !token) return;
    if (status === "already_paid") {
      setPayStatus("recorded");
      return;
    }
    if (status !== "ok" && status !== "loading") return;

    setPayStatus("confirming");
    pollStartRef.current = Date.now();
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const resp = await fetch(fnUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey },
          body: JSON.stringify({ action: "status", token }),
        });
        const data = await resp.json();
        if (data.payment_status === "recorded") {
          setPayStatus("recorded");
          setStatus("already_paid");
          return;
        }
      } catch (err: any) {
        // In-app browsers can drop the connection after a redirect. Keep
        // polling; the timeout gives the guest a clear end-state.
        console.error("[GuestPaymentLink] poll tick failed", {
          token,
          userAgent: navigator.userAgent,
          error: err.message || "Unknown",
        });
        void logClientError({
          action: "guest-payment-link:poll",
          category: "network_error",
          failureReason: err.message || "Poll tick failed",
          details: {
            token,
            userAgent: navigator.userAgent,
          },
        });
      }
      const elapsed = Date.now() - (pollStartRef.current ?? Date.now());
      if (elapsed >= POLL_TIMEOUT_MS) {
        setPayStatus("timeout");
        return;
      }
      setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [urlStatus, token, status, fnUrl, apikey]);

  const handlePay = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const resp = await fetch(fnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey },
        body: JSON.stringify({
          action: "checkout",
          token,
          success_url: `${window.location.origin}/pay/${token}?status=success`,
          cancel_url: `${window.location.origin}/pay/${token}?status=cancelled`,
        }),
      });
      const data = await resp.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setErrorMsg(data.error || "Payment could not be started");
        setSubmitting(false);
      }
    } catch (err: any) {
      const message = err.message || "Network error";
      setErrorMsg(message);
      setSubmitting(false);
      console.error("[GuestPaymentLink] checkout failed", {
        token,
        userAgent: navigator.userAgent,
        error: message,
      });
      void logClientError({
        action: "guest-payment-link:checkout",
        category: "network_error",
        failureReason: message,
        details: {
          token,
          userAgent: navigator.userAgent,
        },
      });
    }
  };

  const handleRetry = () => setRetryTick((t) => t + 1);

  const showConfirming = urlStatus === "success" && payStatus === "confirming";
  const showConfirmed = payStatus === "recorded" || status === "already_paid";
  const showTimeout = urlStatus === "success" && payStatus === "timeout";
  const showCancelled = urlStatus === "cancelled" && status === "ok";

  const recommendedBrowser = /iPhone|iPad/i.test(navigator.userAgent)
    ? "Safari"
    : "Chrome";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-foreground">
            Deposit Payment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {inAppInfo.isInApp && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-warning/10">
              <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm text-foreground">
                Having trouble? Tap ⋮ and choose{" "}
                <strong>Open in {recommendedBrowser}</strong> to finish
                securely.
              </div>
            </div>
          )}

          {status === "loading" && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {showConfirmed && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-primary/10">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm text-foreground">
                Payment received. You can close this page.
              </div>
            </div>
          )}
          {showConfirming && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted">
              <Loader2 className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5 animate-spin" />
              <div className="text-sm text-foreground">
                Payment submitted. We're confirming it now — this usually takes
                a few seconds.
              </div>
            </div>
          )}
          {showTimeout && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-warning/10">
              <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm text-foreground">
                Payment submitted but not confirmed yet. Please contact the
                front desk before trying again — do not pay twice.
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="shrink-0"
              >
                <RefreshCw className="h-4 w-4 mr-2" /> Check again
              </Button>
            </div>
          )}
          {showCancelled && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted">
              <XCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                Checkout was cancelled. You can try again below.
              </div>
            </div>
          )}

          {summary && (
            <div className="rounded-md border border-border p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Accommodation</span>
                <span className="font-medium text-foreground">
                  {summary.unit_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Check-in</span>
                <span className="text-foreground">{summary.check_in}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Check-out</span>
                <span className="text-foreground">{summary.check_out}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Guests</span>
                <span className="text-foreground">{summary.num_guests}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="text-muted-foreground">Deposit due</span>
                <span className="font-semibold text-foreground">
                  {summary.currency.toUpperCase()} {summary.amount.toFixed(0)}
                </span>
              </div>
            </div>
          )}

          {status === "ok" && !showConfirming && !showConfirmed && !showTimeout && (
            <Button
              onClick={handlePay}
              disabled={submitting}
              className="w-full gap-2"
              size="lg"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              {submitting ? "Opening secure checkout..." : "Pay Deposit"}
            </Button>
          )}

          {status === "expired" && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted">
              <Clock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                This payment link has expired. Please contact the front desk for
                a new link.
              </div>
            </div>
          )}
          {status === "revoked" && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted">
              <XCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                This payment link is no longer valid. Please contact the front
                desk.
              </div>
            </div>
          )}
          {(status === "invalid" || status === "error") && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-md bg-destructive/10">
                <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm text-foreground">
                  {errorMsg || "This payment link is invalid."}
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleRetry}
                className="w-full gap-2"
              >
                <RefreshCw className="h-4 w-4" /> Try again
              </Button>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Secured by Stripe. You do not need an account to complete this
            payment.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
