import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function WebhookHealthCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["webhook-health"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_health")
        .select("*")
        .eq("provider", "stripe")
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    refetchInterval: 30_000,
  });

  const reason: string = data?.last_failure_reason ?? "";
  const isUnsignedProbe = /missing stripe-signature/i.test(reason);
  const hasSuccess = !!data?.last_success_at;
  const rawStatus = data?.status ?? "unknown";

  // A failure caused only by an unsigned probe/scanner is not a real Stripe failure.
  const effectiveStatus =
    rawStatus === "healthy" && hasSuccess
      ? "healthy"
      : rawStatus === "failing" && !isUnsignedProbe
        ? "failing"
        : "awaiting";

  const badge =
    effectiveStatus === "healthy"
      ? { label: "Stripe webhook verified", icon: CheckCircle2, variant: "default" as const }
      : effectiveStatus === "failing"
        ? { label: "Signature verification failed", icon: AlertTriangle, variant: "destructive" as const }
        : { label: "Awaiting first Stripe event", icon: Clock, variant: "secondary" as const };
  const Icon = badge.icon;

  const explainer =
    effectiveStatus === "healthy"
      ? "Stripe events are arriving and passing signature verification."
      : effectiveStatus === "failing"
        ? "Stripe signature verification failed. Check the webhook secret or Stripe endpoint configuration."
        : isUnsignedProbe
          ? "Unsigned request rejected. This is expected for non-Stripe probes and does not mean Stripe is failing."
          : "Awaiting first Stripe event. Send a test event from the Stripe dashboard or take a live payment to verify.";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Stripe Webhook Health</CardTitle>
              <CardDescription>Live status of incoming payment webhooks</CardDescription>
            </div>
          </div>
          <Badge variant={badge.variant} className="gap-1.5">
            <Icon className="h-3 w-3" />
            {badge.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Last received</p>
              <p className="text-foreground font-medium">{data?.last_received_at ? formatDistanceToNow(new Date(data.last_received_at), { addSuffix: true }) : "Never"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Last success</p>
              <p className="text-foreground font-medium">{data?.last_success_at ? formatDistanceToNow(new Date(data.last_success_at), { addSuffix: true }) : "Never"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Last failure</p>
              <p className="text-foreground font-medium">{data?.last_failure_at ? formatDistanceToNow(new Date(data.last_failure_at), { addSuffix: true }) : "Never"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Last event id</p>
              <p className="text-foreground font-medium font-mono truncate">{data?.last_event_id || "—"}</p>
            </div>
            {effectiveStatus === "failing" && reason && (
              <div className="col-span-2 rounded-md bg-destructive/10 p-2">
                <p className="text-destructive font-medium">{reason}</p>
              </div>
            )}
            {effectiveStatus === "awaiting" && isUnsignedProbe && (
              <div className="col-span-2 rounded-md bg-muted p-2">
                <p className="text-muted-foreground">Last rejected request had no <code>stripe-signature</code> header — treated as a non-Stripe probe, not a Stripe failure.</p>
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">{explainer}</p>
      </CardContent>
    </Card>
  );
}
