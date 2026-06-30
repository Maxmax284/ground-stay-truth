import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, PowerOff, Clock } from "lucide-react";

type Status = "healthy" | "warning" | "broken" | "unknown" | "not_configured" | "pending";

const DOT: Record<Status, string> = {
  healthy: "bg-emerald-500",
  warning: "bg-amber-500",
  broken: "bg-rose-500",
  pending: "bg-sky-500",
  unknown: "bg-slate-400",
  not_configured: "bg-slate-300",
};

const ICON: Record<Status, typeof CheckCircle2> = {
  healthy: CheckCircle2,
  warning: AlertTriangle,
  broken: XCircle,
  pending: Clock,
  unknown: HelpCircle,
  not_configured: PowerOff,
};

interface Probe { key: string; label: string; status: Status; }

export function SystemsMatrixPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["ops-service-health"],
    queryFn: async (): Promise<Probe[]> => {
      const { data, error } = await supabase.rpc("get_ops_service_health");
      if (error) throw error;
      return (data ?? []) as Probe[];
    },
    refetchInterval: 60_000,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading matrix…</p>;

  const totals = (data ?? []).reduce<Record<Status, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, { healthy: 0, warning: 0, broken: 0, pending: 0, unknown: 0, not_configured: 0 });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">At-a-glance</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {(Object.keys(totals) as Status[]).map((s) => {
            const Icon = ICON[s];
            return (
              <div key={s} className="flex items-center gap-2 text-sm">
                <span className={`h-2.5 w-2.5 rounded-full ${DOT[s]}`} />
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="capitalize">{s.replace("_", " ")}</span>
                <Badge variant="secondary" className="text-[10px]">{totals[s]}</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Service grid</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {data?.map((p) => (
              <div
                key={p.key}
                className="rounded-md border p-2 flex flex-col items-center gap-1 text-center"
                title={`${p.label}: ${p.status}`}
              >
                <span className={`h-3 w-3 rounded-full ${DOT[p.status]}`} />
                <span className="text-[11px] leading-tight font-medium">{p.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
