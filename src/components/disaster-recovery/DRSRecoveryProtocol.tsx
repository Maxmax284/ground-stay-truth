import { ListChecks, Terminal, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRecoveryAuditLog } from "@/hooks/useRecoveryAuditLog";
import { toast } from "sonner";

interface ProtocolStep {
  title: string;
  command?: string;
  description: string;
  critical: boolean;
}

const protocol: ProtocolStep[] = [
  {
    title: "Clone the repository",
    command: "git clone <repo-url> && cd groundstay",
    description: "Pull full source from GitHub. Verify branch is main/production.",
    critical: true,
  },
  {
    title: "Install dependencies",
    command: "bun install",
    description: "Install all packages. Verify no resolution errors in output.",
    critical: true,
  },
  {
    title: "Configure environment variables",
    description: "Copy .env.example → .env. Set all required variables: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID. Set edge function secrets via dashboard.",
    critical: true,
  },
  {
    title: "Restore the database",
    command: "supabase db push",
    description: "Apply all migrations. If restoring from backup, use the managed restore flow first, then verify schema matches migration state.",
    critical: true,
  },
  {
    title: "Deploy edge functions",
    command: "supabase functions deploy",
    description: "Deploy all server-side functions. Verify each function is listed as deployed.",
    critical: true,
  },
  {
    title: "Configure external integrations",
    description: "Re-enter Stripe keys, Resend API key, VAPID keys, and any other integration credentials through Settings → Integrations.",
    critical: false,
  },
  {
    title: "Build the application",
    command: "bun run build",
    description: "Full production build. Zero TypeScript errors required. Zero build warnings on critical paths.",
    critical: true,
  },
  {
    title: "Deploy to hosting",
    description: "Publish through Lovable, or deploy build output to chosen hosting provider.",
    critical: true,
  },
  {
    title: "Run validation checks",
    description: "Execute the validation layer: auth flow, booking creation, payment processing, dashboard access. All must pass.",
    critical: true,
  },
  {
    title: "Verify realtime connections",
    description: "Confirm WebSocket connections for messaging and notifications are active.",
    critical: false,
  },
];

export default function DRSRecoveryProtocol() {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const { logAction } = useRecoveryAuditLog();

  const toggleStep = (i: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleLogProtocol = async () => {
    const completed = completedSteps.size;
    const total = protocol.length;
    const incomplete = protocol
      .filter((_, i) => !completedSteps.has(i))
      .map((s) => s.title);

    try {
      await logAction.mutateAsync({
        action: `Recovery protocol executed: ${completed}/${total} steps completed`,
        category: "recovery_protocol",
        outcome: completed === total ? "success" : "partial",
        details: { completed, total, incomplete },
        failure_reason: completed < total ? `Incomplete steps: ${incomplete.join(", ")}` : undefined,
      });
      toast.success("Protocol status logged");
    } catch {
      toast.error("Failed to log");
    }
  };

  const criticalIncomplete = protocol.some(
    (s, i) => s.critical && !completedSteps.has(i)
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <ListChecks className="h-5 w-5" />
          Recovery Protocol
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Linear, step-by-step platform rebuild sequence. Execute under pressure.
        </p>
      </div>

      {criticalIncomplete && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm text-foreground">
              Critical steps incomplete. Deployment is blocked until all critical steps pass.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {protocol.map((step, i) => (
          <Card
            key={i}
            className={`cursor-pointer transition-colors ${completedSteps.has(i) ? "bg-green-50/50 border-green-200" : ""}`}
            onClick={() => toggleStep(i)}
          >
            <CardContent className="pt-4 pb-4 flex items-start gap-3">
              <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                completedSteps.has(i) ? "bg-green-600 text-white" : "bg-primary/10 text-primary"
              }`}>
                {completedSteps.has(i) ? "✓" : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{step.title}</p>
                  {step.critical && (
                    <Badge variant="outline" className="text-[10px] text-red-600 border-red-300 bg-red-50">Critical</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
                {step.command && (
                  <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2 mt-2 font-mono text-xs text-foreground">
                    <Terminal className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <code>{step.command}</code>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button variant="outline" size="sm" onClick={handleLogProtocol}>
        Log Protocol Status
      </Button>
    </div>
  );
}
