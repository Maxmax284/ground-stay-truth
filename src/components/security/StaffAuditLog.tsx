/**
 * Staff Audit Log viewer for the Security Center.
 * Filterable by event type, severity, and free-text search.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShieldAlert, History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useStaffAuditEvents, type StaffAuditSeverity } from "@/hooks/useStaffAudit";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SEV_COLORS: Record<StaffAuditSeverity, string> = {
  info: "bg-muted text-muted-foreground",
  low: "bg-muted text-muted-foreground",
  medium: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300",
  high: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
  critical: "bg-destructive/20 text-destructive",
};

export function StaffAuditLog() {
  const [search, setSearch] = useState("");
  const [sev, setSev] = useState<StaffAuditSeverity | "all">("all");

  const { data, isLoading } = useStaffAuditEvents({
    search: search || undefined,
    severities: sev === "all" ? undefined : [sev],
    limit: 200,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" />
          Security audit log
          <Badge variant="outline" className="ml-auto text-xs">
            {data?.length ?? 0}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="Search by event, email, reason…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[12rem]"
          />
          <Select value={sev} onValueChange={(v) => setSev(v as any)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No events yet.</p>
        ) : (
          <ScrollArea className="h-[420px]">
            <div className="space-y-2 pr-3">
              {data.map((e: any) => (
                <div
                  key={e.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card/50"
                >
                  <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {e.event_type.replace(/_/g, " ")}
                      </span>
                      <Badge className={`text-xs ${SEV_COLORS[e.severity as StaffAuditSeverity] || ""}`}>
                        {e.severity}
                      </Badge>
                    </div>
                    {e.reason && (
                      <p className="text-xs text-muted-foreground mt-1">{e.reason}</p>
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
      </CardContent>
    </Card>
  );
}
