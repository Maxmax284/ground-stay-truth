import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, CheckCircle2, XCircle, Clock } from "lucide-react";

type Status = "loading" | "ok" | "expired" | "already_paid" | "already_used" | "revoked" | "invalid" | "error";

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

export default function GuestPaymentLink() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const urlStatus = params.get("status");

  const [status, setStatus] = useState<Status>("loading");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [verifying, setVerifying] = useState(false);

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guest-payment-link`;
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  useEffect(() => {
    if (!token) return setStatus("invalid");
    (async () => {
      try {
        // If the guest just returned from Stripe with status=success, run the
        // webhook fallback verifier before showing UI. This ensures the booking
        // gets confirmed even if Stripe's webhook hasn't fired yet.
        if (urlStatus === "success") {
          setVerifying(true);
          try {
            await fetch(fnUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey },
              body: JSON.stringify({ action: "verify", token }),
            });
          } catch { /* swallow — lookup below still runs */ }
          setVerifying(false);
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
        else if (data.status === "already_used") setStatus("already_used");
        else if (data.status === "revoked") setStatus("revoked");
        else setStatus("invalid");
      } catch (err: any) {
        setErrorMsg(err.message || "Network error");
        setStatus("error");
      }
    })();
  }, [token, fnUrl, apikey, urlStatus]);

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
      setErrorMsg(err.message || "Network error");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-foreground">Deposit Payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" && (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          )}

          {urlStatus === "success" && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-primary/10">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm text-foreground">Payment received. You can close this page.</div>
            </div>
          )}
          {urlStatus === "cancelled" && status === "ok" && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted">
              <XCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">Payment cancelled. You can try again below.</div>
            </div>
          )}

          {summary && (
            <div className="rounded-md border border-border p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Accommodation</span><span className="font-medium text-foreground">{summary.unit_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Check-in</span><span className="text-foreground">{summary.check_in}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Check-out</span><span className="text-foreground">{summary.check_out}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Guests</span><span className="text-foreground">{summary.num_guests}</span></div>
              <div className="flex justify-between pt-2 border-t border-border"><span className="text-muted-foreground">Deposit due</span><span className="font-semibold text-foreground">{summary.currency.toUpperCase()} {summary.amount.toFixed(0)}</span></div>
            </div>
          )}

          {status === "ok" && (
            <Button onClick={handlePay} disabled={submitting} className="w-full gap-2" size="lg">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {submitting ? "Opening secure checkout..." : "Pay Deposit"}
            </Button>
          )}

          {status === "expired" && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted">
              <Clock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">This payment link has expired. Please contact the front desk for a new link.</div>
            </div>
          )}
          {(status === "already_paid" || status === "already_used") && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-primary/10">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm text-foreground">{status === "already_paid" ? "This deposit has already been paid. No further action needed." : "This link has already been used. If you didn't complete checkout, contact the front desk."}</div>
            </div>
          )}
          {status === "revoked" && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted">
              <XCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">This payment link is no longer valid. Please contact the front desk.</div>
            </div>
          )}
          {(status === "invalid" || status === "error") && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-destructive/10">
              <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm text-foreground">{errorMsg || "This payment link is invalid."}</div>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">Secured by Stripe. You do not need an account to complete this payment.</p>
        </CardContent>
      </Card>
    </div>
  );
}
