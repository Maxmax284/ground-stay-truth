import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, AlertTriangle, CircleDashed, CircleOff } from "lucide-react";
import { readinessChecks, nextSteps, FIX_LINKS, type Readiness, type CheckState } from "@/lib/commsReadiness";
import { Link } from "react-router-dom";

const ICON: Record<CheckState, JSX.Element> = {
  ok: <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden />,
  missing: <AlertTriangle className="h-4 w-4 text-destructive shrink-0" aria-hidden />,
  warn: <AlertTriangle className="h-4 w-4 text-warning shrink-0" aria-hidden />,
  unverified: <CircleDashed className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />,
  off: <CircleOff className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />,
};
const WORD: Record<CheckState, string> = { ok: "Ready", missing: "Missing", warn: "Check", unverified: "Not verified", off: "Off" };

/** Read-only. Shows what's set up for urgent alerts and what's still unproven. Nothing here changes settings. */
export function AlertReadinessCard() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["comms-readiness"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_comms_readiness" as any);
      if (error) throw error;
      return data as unknown as Readiness;
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Alert readiness</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh">
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="text-sm">
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : isError || !data ? (
          <p className="text-destructive">Couldn't load readiness. Managers and admins only.</p>
        ) : (
          <>
          {(() => { const n = nextSteps(data).length; return (
            <p className="mb-2 rounded-md border border-border bg-muted/40 p-2 text-xs">
              {n === 0 ? "Setup steps done. Escalation still needs management approval and a real-phone practice run before it's switched on."
                : `${n} setup step${n === 1 ? "" : "s"} left. Work top to bottom. Nothing here sends alerts or turns escalation on.`}
            </p>); })()}
          <ul className="divide-y divide-border">
            {readinessChecks(data).map((c) => (
              <li key={c.id} className="flex items-start gap-3 py-2.5">
                {ICON[c.state]}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground break-anywhere">{c.detail}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant="outline" className="text-[10px]">{WORD[c.state]}</Badge>
                  {(c.state === "missing" || c.state === "warn") && FIX_LINKS[c.id] && (
                    <Link to={FIX_LINKS[c.id].to} className="text-[11px] underline text-primary">{FIX_LINKS[c.id].label} →</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
