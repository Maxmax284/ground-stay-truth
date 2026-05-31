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

  const status = data?.status ?? "unknown";
  const badge =
    status === "healthy" ? { label: "Healthy", icon: CheckCircle2, variant: "default" as const }
    : status === "failing" ? { label: "Failing", icon: AlertTriangle, variant: "destructive" as const }
    : { label: "Awaiting first event", icon: Clock, variant: "secondary" as const };
  const Icon = badge.icon;

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
            {data?.last_failure_reason && (
              <div className="col-span-2 rounded-md bg-destructive/10 p-2">
                <p className="text-destructive font-medium">{data.last_failure_reason}</p>
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          If no events arrive after a test payment, verify the webhook URL and <code>stripe_webhook_secret</code> match the Stripe dashboard. Signature verification failures appear here within seconds.
        </p>
      </CardContent>
    </Card>
  );
}
