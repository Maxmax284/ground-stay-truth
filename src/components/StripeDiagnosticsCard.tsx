import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  warnings: string[];
}

export function StripeDiagnosticsCard() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payment-diagnostics`,
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
      if (!resp.ok) throw new Error(body.error || "Failed to load diagnostics");
      setData(body);
    } catch (e: any) {
      setError(e.message || "Failed to load diagnostics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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
        <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="gap-1">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!data && !error && (
          <p className="text-xs text-muted-foreground">Loading diagnostics…</p>
        )}
        {data && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={modeVariant as any}>
                Stripe mode: {data.stripe_mode}
              </Badge>
              <Badge variant={data.webhook_secret_configured ? "outline" : "destructive"}>
                Webhook secret: {data.webhook_secret_configured ? "configured" : "missing"}
              </Badge>
              <Badge variant="outline">
                Events processed: {data.payment_events_count}
              </Badge>
              <Badge variant="outline">
                Recorded payments: {data.recorded_stripe_payments}
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
            {data.warnings.length > 0 ? (
              <ul className="space-y-1.5">
                {data.warnings.map((w) => (
                  <li key={w} className="flex items-start gap-2 text-xs text-warning">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {w}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 text-xs text-[hsl(var(--success))]">
                <CheckCircle2 className="h-3.5 w-3.5" /> All green — live mode, webhook healthy.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
