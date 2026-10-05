import { fetchPaymentDiagnostics } from "@/lib/paymentDiagnostics";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, AlertTriangle, CheckCircle2, RefreshCw, XCircle, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


interface Diagnostics {
  stripe_mode: "test" | "live" | "unknown" | "not_configured";
  webhook_secret_configured: boolean;
  webhook_health: {
    last_success_at: string | null;
    last_failure_at: string | null;
    last_failure_reason: string | null;
    status: string | null;
  } | null;
  payment_events_count: number;
  recorded_stripe_payments: number;
  production_origin: boolean;
  smoke_test_passed: boolean;
  live_safe: boolean;
  status: "GO" | "NO_GO";
  payment_links_blocked: boolean;
  next_action: string;
  warnings: string[];
}

export function StripeDiagnosticsCard() {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [data, setData] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);


  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await fetchPaymentDiagnostics();
      if (!body) throw new Error("Session expired — sign in again to view diagnostics");
      setData(body);
    } catch (e: any) {
      setError(e.message || "Failed to load diagnostics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const runSelfTest = async () => {
    setTesting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-webhook-selftest`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      );
      const body = await resp.json();
      if (!resp.ok || !body.ok) {
        toast.error(body.hint || body.error || `Self-test failed (stage: ${body.stage || "unknown"})`);
      } else {
        toast.success("Signing chain verified. Payment links unblocked.");
        await load();
      }
    } catch (e: any) {
      toast.error(e.message || "Self-test failed");
    } finally {
      setTesting(false);
    }
  };


  const modeVariant = data?.stripe_mode === "live"
    ? "default"
    : data?.stripe_mode === "test"
    ? "destructive"
    : "outline";

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Stripe & Webhook Health
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="gap-1">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!data && !error && (
          <p className="text-xs text-muted-foreground">Loading diagnostics…</p>
        )}
        {data && (
          <>
            {/* GO / NO-GO banner */}
            <div className={`flex items-start gap-2 rounded-md p-2.5 ${data.live_safe ? "bg-[hsl(var(--success))]/10" : "bg-destructive/10"}`}>
              {data.live_safe ? (
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))] shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              )}
              <div className="text-xs flex-1">
                <div className="font-semibold text-foreground">
                  {data.live_safe ? "GO — Live Stripe ready" : "NO-GO — Online payment links are blocked"}
                </div>
                <div className="text-muted-foreground mt-0.5">{data.next_action}</div>
                {!data.live_safe && data.stripe_mode === "live" && data.webhook_secret_configured && (
                  <Button
                    size="sm"
                    onClick={runSelfTest}
                    disabled={testing}
                    className="gap-1 mt-2 h-7 text-xs"
                  >
                    {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                    Run signing self-test
                  </Button>
                )}
              </div>
            </div>


            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={modeVariant as any}>
                Stripe mode: {data.stripe_mode}
              </Badge>
              <Badge variant={data.webhook_secret_configured ? "outline" : "destructive"}>
                Webhook secret: {data.webhook_secret_configured ? "configured" : "missing"}
              </Badge>
              <Badge variant={data.webhook_health?.last_success_at || data.smoke_test_passed ? "outline" : "destructive"}>
                Webhook verified: {data.webhook_health?.last_success_at ? "yes" : data.smoke_test_passed ? "smoke-tested" : "never"}
              </Badge>
              <Badge variant="outline">
                Events: {data.payment_events_count}
              </Badge>
              <Badge variant="outline">
                Recorded payments: {data.recorded_stripe_payments}
              </Badge>
              <Badge variant={data.payment_links_blocked ? "destructive" : "outline"}>
                New links: {data.payment_links_blocked ? "blocked" : "allowed"}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>
                Last webhook success:{" "}
                {data.webhook_health?.last_success_at
                  ? new Date(data.webhook_health.last_success_at).toLocaleString()
                  : "never"}
              </div>
              {data.webhook_health?.last_failure_at && (
                <div>
                  Last failure:{" "}
                  {new Date(data.webhook_health.last_failure_at).toLocaleString()}
                  {data.webhook_health.last_failure_reason
                    ? ` — ${data.webhook_health.last_failure_reason}`
                    : ""}
                </div>
              )}
            </div>
            {data.warnings.length > 0 && (
              <ul className="space-y-1.5">
                {data.warnings.map((w) => (
                  <li key={w} className="flex items-start gap-2 text-xs text-warning">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {w}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
