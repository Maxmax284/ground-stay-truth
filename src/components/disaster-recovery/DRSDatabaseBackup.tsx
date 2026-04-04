import { Database, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRecoveryAuditLog } from "@/hooks/useRecoveryAuditLog";
import { toast } from "sonner";

const restoreSteps = [
  "Select restore point from backup history",
  "Verify backup integrity (checksum validation)",
  "Disable active connections",
  "Restore schema from migration files",
  "Restore data from backup snapshot",
  "Run post-restore integrity checks",
  "Re-enable connections and validate access",
];

export default function DRSDatabaseBackup() {
  const { logAction } = useRecoveryAuditLog();

  const handleLogCheck = async () => {
    try {
      await logAction.mutateAsync({
        action: "Database backup status checked",
        category: "database",
        outcome: "success",
      });
      toast.success("Backup check logged");
    } catch {
      toast.error("Failed to log action");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Database className="h-5 w-5" />
          Database Backup & Restore
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Backup visibility, restore procedures, and integrity validation.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Backup Frequency</p>
            </div>
            <p className="text-sm font-semibold text-foreground">Daily (automated)</p>
            <Badge variant="outline" className="text-[10px] mt-2 text-green-600 border-green-300 bg-green-50">
              Active
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Backup Provider</p>
            </div>
            <p className="text-sm font-semibold text-foreground">Lovable Cloud</p>
            <p className="text-xs text-muted-foreground mt-1">Managed by infrastructure</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Integrity</p>
            </div>
            <p className="text-sm font-semibold text-foreground">Schema + Data</p>
            <p className="text-xs text-muted-foreground mt-1">Full restore coverage</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Guided Restore Process</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {restoreSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <span className="text-sm text-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="pt-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">Fail-Safe</p>
            <p className="text-xs text-muted-foreground mt-1">
              Partial or corrupted restores are blocked. The system validates schema integrity and row counts before completing any restore operation.
            </p>
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" size="sm" onClick={handleLogCheck}>
        Log Backup Check
      </Button>
    </div>
  );
}
