import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { BellRing, CheckCircle2, AlertTriangle, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface DeliveryRow {
  id: string;
  user_id: string | null;
  endpoint_tail: string | null;
  title: string | null;
  status: string;
  http_status: number | null;
  error: string | null;
  source: string | null;
  created_at: string;
}

interface DeviceRow {
  id: string;
  user_id: string;
  platform: string | null;
  standalone: boolean | null;
  last_success_at: string | null;
  last_error: string | null;
  failure_count: number | null;
  created_at: string;
}

/**
 * Plain-English phone-alert health for admins: how many staff phones are
 * registered, and whether recent alerts actually landed.
 */
export function PushHealth() {
  const { data, isLoading } = useQuery({
    queryKey: ["push-health"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [devices, deliveries] = await Promise.all([
        supabase
          .from("push_subscriptions")
          .select("id, user_id, platform, standalone, last_success_at, last_error, failure_count, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("push_delivery_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(25),
      ]);
      return {
        devices: (devices.data ?? []) as unknown as DeviceRow[],
        deliveries: (deliveries.data ?? []) as unknown as DeliveryRow[],
      };
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BellRing className="h-5 w-5 text-primary" /> Phone Alerts
          </CardTitle>
        </CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  const devices = data?.devices ?? [];
  const deliveries = data?.deliveries ?? [];
  const recentFailures = deliveries.filter((d) => d.status !== "delivered").length;
  const lastDelivered = deliveries.find((d) => d.status === "delivered");

  const verdict =
    devices.length === 0
      ? {
          tone: "warn" as const,
          text: "No phones are registered for alerts yet. Staff need to open Settings on their phone and turn alerts on.",
        }
      : recentFailures === 0 && lastDelivered
      ? { tone: "ok" as const, text: `Alerts are landing on ${devices.length} registered device${devices.length === 1 ? "" : "s"}.` }
      : recentFailures > 0
      ? {
          tone: "warn" as const,
          text: `${recentFailures} of the last ${deliveries.length} alerts didn't get through. Affected staff should tap "Reconnect this device" in Settings.`,
        }
      : {
          tone: "info" as const,
          text: `${devices.length} device${devices.length === 1 ? "" : "s"} registered, but no alerts sent yet. Send a test from Settings.`,
        };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BellRing className="h-5 w-5 text-primary" /> Phone Alerts
          <Badge variant={verdict.tone === "ok" ? "secondary" : "outline"} className="ml-auto text-xs">
            {devices.length} device{devices.length === 1 ? "" : "s"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
            verdict.tone === "ok" ? "bg-emerald-500/10" : "bg-amber-500/10"
          }`}
        >
          {verdict.tone === "ok" ? (
            <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
          )}
          <span>{verdict.text}</span>
        </div>

        {devices.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Registered devices
            </p>
            {devices.slice(0, 8).map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-md border p-2 text-xs"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Smartphone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">
                    {(d.platform ?? "unknown").toUpperCase()}
                    {d.standalone ? " · installed app" : " · browser"}
                  </span>
                </span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {d.last_success_at
                    ? `last alert ${formatDistanceToNow(new Date(d.last_success_at), { addSuffix: true })}`
                    : d.last_error
                    ? "problem reported"
                    : "no alerts yet"}
                </span>
              </div>
            ))}
          </div>
        )}

        {deliveries.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Recent alerts
            </p>
            {deliveries.slice(0, 8).map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate">{d.title ?? "Alert"}</span>
                <span
                  className={`whitespace-nowrap ${
                    d.status === "delivered" ? "text-emerald-600" : "text-destructive"
                  }`}
                >
                  {d.status === "delivered" ? "Delivered" : "Didn't arrive"} ·{" "}
                  {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
