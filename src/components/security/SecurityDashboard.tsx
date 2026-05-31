/**
 * Security Dashboard — unified view of staff audit events + system security events
 * (Fenrir Lock). Replaces the older SecurityEventLog with filters, severity
 * breakdown, time-window selection, and alert surfacing.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldAlert, ShieldCheck, Activity, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Severity = "info" | "low" | "medium" | "high" | "critical";
type Source = "staff" | "system";
type Window = "1h" | "24h" | "7d" | "30d" | "all";

interface UnifiedEvent {
  id: string;
  source: Source;
  event_type: string;
  severity: Severity;
  actor_email: string | null;
  actor_role: string | null;
  reason: string | null;
  created_at: string;
}

const SEV_COLORS: Record<Severity, string> = {
  info: "bg-muted text-muted-foreground",
  low: "bg-muted text-muted-foreground",
  medium: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300",
  high: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
  critical: "bg-destructive/20 text-destructive",
};

const WINDOW_HOURS: Record<Window, number | null> = {
  "1h": 1, "24h": 24, "7d": 24 * 7, "30d": 24 * 30, all: null,
};

function sinceFor(w: Window): string | null {
  const h = WINDOW_HOURS[w];
  if (!h) return null;
  return new Date(Date.now() - h * 3600_000).toISOString();
}

export function SecurityDashboard() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [sev, setSev] = useState<Severity | "all">("all");
  const [source, setSource] = useState<Source | "all">("all");
  const [win, setWin] = useState<Window>("24h");

  const { data, isLoading } = useQuery({
    queryKey: ["security-dashboard", win],
    enabled: isAdmin,
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = sinceFor(win);
      const staffQ = supabase.from("staff_audit_events").select("*").order("created_at", { ascending: false }).limit(300);
      const sysQ = supabase.from("security_events").select("*").order("created_at", { ascending: false }).limit(300);
      if (since) { staffQ.gte("created_at", since); sysQ.gte("created_at", since); }
      const [staff, sys] = await Promise.all([staffQ, sysQ]);
      if (staff.error) throw staff.error;
      if (sys.error) throw sys.error;
      const merged: UnifiedEvent[] = [
        ...(staff.data ?? []).map((r: any) => ({
          id: `staff-${r.id}`, source: "staff" as Source,
          event_type: r.event_type, severity: (r.severity || "info") as Severity,
          actor_email: r.actor_email, actor_role: r.actor_role,
          reason: r.reason, created_at: r.created_at,
        })),
        ...(sys.data ?? []).map((r: any) => ({
          id: `sys-${r.id}`, source: "system" as Source,
          event_type: r.event_type, severity: (r.severity || "info") as Severity,
          actor_email: r.actor_email, actor_role: r.actor_role,
          reason: r.details ? JSON.stringify(r.details).slice(0, 200) : null,
          created_at: r.created_at,
        })),
      ];
      merged.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return merged;
    },
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (sev !== "all" && r.severity !== sev) return false;
      if (source !== "all" && r.source !== source) return false;
      if (needle && !(
        r.event_type.toLowerCase().includes(needle) ||
        r.actor_email?.toLowerCase().includes(needle) ||
        r.reason?.toLowerCase().includes(needle)
      )) return false;
      return true;
    });
  }, [data, sev, source, search]);

  const counts = useMemo(() => {
    const c = { total: 0, critical: 0, high: 0, medium: 0, info: 0 };
    (data ?? []).forEach((r) => {
      c.total++;
      if (r.severity === "critical") c.critical++;
      else if (r.severity === "high") c.high++;
      else if (r.severity === "medium") c.medium++;
      else c.info++;
    });
    return c;
  }, [data]);

  if (!isAdmin) return null;

  const alerting = counts.critical + counts.high > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          Security dashboard
          <Badge variant="outline" className="ml-auto text-xs">{counts.total} events</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerting ? (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            <div className="text-sm">
              <span className="font-medium text-destructive">
                {counts.critical} critical · {counts.high} high
              </span>
              <span className="text-muted-foreground"> in the selected window. Review below.</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" /> No high-severity events in the selected window.
          </div>
        )}

        <div className="grid grid-cols-4 gap-2">
          {(["critical", "high", "medium", "info"] as Severity[]).map((s) => (
            <div key={s} className="p-2 rounded-md border border-border bg-card/50 text-center">
              <div className="text-lg font-semibold">{(counts as any)[s] ?? 0}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s}</div>
            </div>
          ))}
        </div>

        <Tabs value={win} onValueChange={(v) => setWin(v as Window)}>
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="1h">1h</TabsTrigger>
            <TabsTrigger value="24h">24h</TabsTrigger>
            <TabsTrigger value="7d">7d</TabsTrigger>
            <TabsTrigger value="30d">30d</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
          <TabsContent value={win} className="mt-3 space-y-2">
            <div className="flex gap-2 flex-wrap">
              <Input
                placeholder="Search by event, email, reason…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 min-w-[10rem]"
              />
              <Select value={sev} onValueChange={(v) => setSev(v as any)}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
              <Select value={source} onValueChange={(v) => setSource(v as any)}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="staff">Staff actions</SelectItem>
                  <SelectItem value="system">System (Fenrir)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
            ) : !filtered.length ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No events match these filters.</p>
            ) : (
              <ScrollArea className="h-[440px]">
                <div className="space-y-2 pr-3">
                  {filtered.map((e) => (
                    <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card/50">
                      <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{e.event_type.replace(/_/g, " ")}</span>
                          <Badge className={`text-xs ${SEV_COLORS[e.severity]}`}>{e.severity}</Badge>
                          <Badge variant="outline" className="text-xs">{e.source}</Badge>
                        </div>
                        {e.reason && (
                          <p className="text-xs text-muted-foreground mt-1 break-words">{e.reason}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {e.actor_email || e.actor_role || "System"} ·{" "}
                          {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
