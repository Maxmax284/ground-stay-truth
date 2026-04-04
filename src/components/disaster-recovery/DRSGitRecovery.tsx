import { GitBranch, CheckCircle2, Terminal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  {
    title: "Clone Repository",
    command: "git clone https://github.com/<org>/groundstay.git && cd groundstay",
    note: "Pulls entire source including edge functions, migrations, and config.",
  },
  {
    title: "Validate Structure",
    command: "ls -la src/ supabase/ public/ index.html vite.config.ts",
    note: "Confirm core directories and config files are present.",
  },
  {
    title: "Install Dependencies",
    command: "bun install",
    note: "Installs all packages from bun.lock. Verify no missing peer deps.",
  },
  {
    title: "Configure Environment",
    command: "cp .env.example .env && vi .env",
    note: "Set VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID.",
  },
  {
    title: "Run Migrations",
    command: "supabase db push",
    note: "Applies all SQL migrations from supabase/migrations/ in order.",
  },
  {
    title: "Deploy Edge Functions",
    command: "supabase functions deploy",
    note: "Deploys all functions from supabase/functions/.",
  },
  {
    title: "Build & Verify",
    command: "bun run build && bun run preview",
    note: "Full production build. Verify no TypeScript or build errors.",
  },
];

export default function DRSGitRecovery() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          GitHub Source Recovery
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Full platform rebuild from repository source.
        </p>
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {i + 1}
                </span>
                {step.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-start gap-2 bg-muted/50 rounded-md p-3 font-mono text-xs text-foreground">
                <Terminal className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <code>{step.command}</code>
              </div>
              <p className="text-xs text-muted-foreground">{step.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
