import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Result {
  scanned: number;
  reconciled: number;
  still_pending: number;
  failed: number;
}

export function ReconcilePaymentsCard() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reconcile-stripe-payments`,
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
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Sweep failed");
      setResult(data);
      if (data.reconciled > 0) {
        toast.success(`Reconciled ${data.reconciled} payment${data.reconciled === 1 ? "" : "s"}`);
      } else if (data.scanned === 0) {
        toast.success("No pending online payments — you're all caught up");
      } else {
        toast.info(`Scanned ${data.scanned}, none ready to confirm yet`);
      }
    } catch (e: any) {
      toast.error(e.message || "Sweep failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
          Reconcile Online Payments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Checks Stripe directly for any pending online deposits and confirms bookings
          whose webhook didn't fire. Safe to run anytime.
        </p>

        {result && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">Scanned {result.scanned}</Badge>
            {result.reconciled > 0 && (
              <Badge className="bg-success/15 text-[hsl(var(--success))] border-0 gap-1">
                <CheckCircle2 className="h-3 w-3" /> {result.reconciled} reconciled
              </Badge>
            )}
            {result.still_pending > 0 && (
              <Badge className="bg-muted text-muted-foreground border-0">
                {result.still_pending} not yet paid
              </Badge>
            )}
            {result.failed > 0 && (
              <Badge className="bg-destructive/15 text-destructive border-0 gap-1">
                <AlertCircle className="h-3 w-3" /> {result.failed} failed
              </Badge>
            )}
          </div>
        )}

        <Button size="sm" onClick={run} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {loading ? "Checking Stripe…" : "Run Sweep"}
        </Button>
      </CardContent>
    </Card>
  );
}
