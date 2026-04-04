import { ScrollText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRecoveryAuditLog } from "@/hooks/useRecoveryAuditLog";
import { format } from "date-fns";

export default function DRSAuditLog() {
  const { logs, isLoading } = useRecoveryAuditLog();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <ScrollText className="h-5 w-5" />
          Recovery Audit Trail
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          All recovery actions logged with timestamp, role, action, and outcome.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading audit log…</p>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">No recovery actions recorded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{entry.action}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(entry.created_at), "PPpp")}
                      </span>
                      {entry.user_role && (
                        <Badge variant="outline" className="text-[10px]">{entry.user_role}</Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">{entry.category}</Badge>
                    </div>
                    {entry.failure_reason && (
                      <p className="text-xs text-destructive mt-2">{entry.failure_reason}</p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] shrink-0 ${
                      entry.outcome === "success"
                        ? "text-green-600 border-green-300 bg-green-50"
                        : entry.outcome === "failure"
                        ? "text-red-600 border-red-300 bg-red-50"
                        : "text-amber-600 border-amber-300 bg-amber-50"
                    }`}
                  >
                    {entry.outcome}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
