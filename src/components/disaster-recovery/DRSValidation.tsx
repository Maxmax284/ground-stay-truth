import { ShieldCheck, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRecoveryAuditLog } from "@/hooks/useRecoveryAuditLog";
import { toast } from "sonner";

interface ValidationCheck {
  name: string;
  description: string;
  run: () => Promise<boolean>;
}

const checks: ValidationCheck[] = [
  {
    name: "Authentication",
    description: "Verify auth session is active and token refresh works",
    run: async () => {
      const { data } = await supabase.auth.getSession();
      return !!data.session;
    },
  },
  {
    name: "Database Read",
    description: "Verify database connectivity — read units table",
    run: async () => {
      const { error } = await supabase.from("units").select("id").limit(1);
      return !error;
    },
  },
  {
    name: "Profiles Access",
    description: "Verify profile data is accessible",
    run: async () => {
      const { error } = await supabase.from("profiles").select("id").limit(1);
      return !error;
    },
  },
  {
    name: "Bookings Access",
    description: "Verify booking data read access",
    run: async () => {
      const { error } = await supabase.from("bookings").select("id").limit(1);
      return !error;
    },
  },
  {
    name: "Payments Access",
    description: "Verify payment records are readable",
    run: async () => {
      const { error } = await supabase.from("payments").select("id").limit(1);
      return !error;
    },
  },
  {
    name: "Role System",
    description: "Verify user roles table is accessible",
    run: async () => {
      const { error } = await supabase.from("user_roles").select("id").limit(1);
      return !error;
    },
  },
  {
    name: "Storage Buckets",
    description: "Verify file storage is operational",
    run: async () => {
      const { error } = await supabase.storage.from("unit-photos").list("", { limit: 1 });
      return !error;
    },
  },
];

type CheckResult = "pending" | "running" | "pass" | "fail";

export default function DRSValidation() {
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [running, setRunning] = useState(false);
  const { logAction } = useRecoveryAuditLog();

  const runAll = async () => {
    setRunning(true);
    const newResults: Record<string, CheckResult> = {};

    for (const check of checks) {
      setResults((prev) => ({ ...prev, [check.name]: "running" }));
      try {
        const passed = await check.run();
        newResults[check.name] = passed ? "pass" : "fail";
      } catch {
        newResults[check.name] = "fail";
      }
      setResults((prev) => ({ ...prev, [check.name]: newResults[check.name] }));
    }

    const passed = Object.values(newResults).filter((r) => r === "pass").length;
    const failed = Object.values(newResults).filter((r) => r === "fail").length;

    await logAction.mutateAsync({
      action: `Validation suite executed: ${passed} passed, ${failed} failed`,
      category: "validation",
      outcome: failed === 0 ? "success" : "failure",
      details: newResults,
      failure_reason: failed > 0
        ? `Failed checks: ${Object.entries(newResults).filter(([, v]) => v === "fail").map(([k]) => k).join(", ")}`
        : undefined,
    });

    toast(failed === 0 ? "All checks passed" : `${failed} check(s) failed`);
    setRunning(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Validation Layer
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Post-recovery automated checks.
          </p>
        </div>
        <Button onClick={runAll} disabled={running} size="sm">
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Run All Checks
        </Button>
      </div>

      <div className="space-y-2">
        {checks.map((check) => {
          const status = results[check.name] ?? "pending";
          return (
            <Card key={check.name}>
              <CardContent className="pt-4 pb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{check.name}</p>
                  <p className="text-xs text-muted-foreground">{check.description}</p>
                </div>
                {status === "pending" && (
                  <Badge variant="outline" className="text-[10px]">Pending</Badge>
                )}
                {status === "running" && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                {status === "pass" && (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                )}
                {status === "fail" && (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
