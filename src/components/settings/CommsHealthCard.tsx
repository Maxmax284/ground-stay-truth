import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Mail, Bell, MessageSquare, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Health = {
  days: number;
  email: Record<string, number>;
  push: Record<string, number>;
  push_devices: number;
  push_users: number;
  messages: number;
  drafts_waiting: number;
  orphan_messages: number;
  recent_failures: { what: string; status: string; error: string; created_at: string }[];
};

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

/** Admin-only read of how camp alerts are actually being delivered. Read-only. */
export function CommsHealthCard() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["comms-health"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_comms_health" as any, { _days: 7 });
      if (error) throw error;
      return data as unknown as Health;
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Message delivery · last 7 days</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : isError || !data ? (
          <p className="text-destructive">Couldn't load delivery health. Admins only.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Stat icon={<Mail className="h-4 w-4" />} label="Emails" value={sum(data.email)} detail={data.email} />
              <Stat icon={<Bell className="h-4 w-4" />} label="Phone alerts" value={sum(data.push)} detail={data.push}
                note={`${data.push_devices} device${data.push_devices === 1 ? "" : "s"} · ${data.push_users} staff signed up`} />
              <Stat icon={<MessageSquare className="h-4 w-4" />} label="Booking messages" value={data.messages}
                note={`${data.drafts_waiting} draft${data.drafts_waiting === 1 ? "" : "s"} waiting · ${data.orphan_messages} unlinked`} />
            </div>
            {data.push_devices === 0 && (
              <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                No phone is signed up for alerts — email is carrying everything. Turn on Settings → Profile → Ops Alerts on each phone.
              </p>
            )}
            {data.recent_failures.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Recent emails not delivered</p>
                {data.recent_failures.map((f, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">{f.status}</Badge>
                    <span className="break-anywhere">{f.what}</span>
                    <span className="text-muted-foreground">{formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value, detail, note }: {
  icon: React.ReactNode; label: string; value: number; detail?: Record<string, number>; note?: string;
}) {
  return (
    <div className="rounded-md border border-border p-3 space-y-1">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div>
      <div className="font-stat text-2xl">{value}</div>
      {detail && Object.keys(detail).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(detail).map(([k, v]) => <Badge key={k} variant="secondary" className="text-[10px]">{k} {v}</Badge>)}
        </div>
      )}
      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}
