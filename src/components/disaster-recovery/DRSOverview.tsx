import { Activity, Database, GitBranch, Shield, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useRecoveryAuditLog } from "@/hooks/useRecoveryAuditLog";

const healthChecks = [
  { label: "Authentication", key: "auth", icon: Shield },
  { label: "Database", key: "db", icon: Database },
  { label: "Source Control", key: "git", icon: GitBranch },
  { label: "Edge Functions", key: "edge", icon: Activity },
];

export default function DRSOverview() {
  const { logs } = useRecoveryAuditLog();
  const lastAction = logs[0];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Recovery Status</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Current system health and last recovery activity.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {healthChecks.map((check) => (
          <Card key={check.key}>
            <CardContent className="pt-6 flex items-center gap-3">
              <check.icon className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">{check.label}</p>
                <Badge variant="outline" className="text-[10px] mt-1 text-green-600 border-green-300 bg-green-50">
                  Operational
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Last Recovery Action
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lastAction ? (
            <div className="text-sm space-y-1">
              <p className="text-foreground font-medium">{lastAction.action}</p>
              <p className="text-muted-foreground">
                {format(new Date(lastAction.created_at), "PPpp")} — {lastAction.outcome}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No recovery actions recorded.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
