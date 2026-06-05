/**
 * AI Usage dashboard — admin-only.
 * Renders MTD spend, budget burn, per-feature breakdown, top consumers,
 * recent denials, and a one-click 30-minute AI pause.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, AlertTriangle, PauseCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Summary = {
  mtd: { totalCalls: number; totalCost: number; totalTokensIn: number; totalTokensOut: number; monthlyBudget: number };
  daily: Array<{ day: string; calls: number; cost: number; blocked: number }>;
  byFunction: Record<string, { calls: number; blocked: number; cost: number }>;
  topUsers: Array<{ actor_id: string; actorRole: string | null; calls: number; cost: number }>;
  byProperty: Record<string, { calls: number; cost: number }>;
  recentDenials: Array<{ id: string; created_at: string; function_name: string; actor_role: string | null; status: string; error_code: string | null }>;
};

const fmtUsd = (micro: number) => `$${(micro / 1_000_000).toFixed(4)}`;

export function AIUsageDashboard() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [pausing, setPausing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-usage-summary");
      if (error) throw error;
      setData(data as Summary);
    } catch (e: any) {
      toast.error("Failed to load AI usage", { description: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function pauseAi() {
    setPausing(true);
    try {
      const until = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("policy_settings")
        .update({ value: JSON.stringify(until) })
        .eq("key", "ai_pause_until")
        .is("property_id", null);
      if (error) throw error;
      toast.success("AI paused for 30 minutes");
    } catch (e: any) {
      toast.error("Pause failed", { description: e.message });
    } finally {
      setPausing(false);
    }
  }

  if (loading && !data) {
    return (
      <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading AI usage…</CardContent></Card>
    );
  }
  if (!data) return null;

  const { mtd } = data;
  const burnPct = mtd.monthlyBudget > 0 ? Math.min(100, (mtd.totalCost / mtd.monthlyBudget) * 100) : 0;
  const burnColor = burnPct >= 90 ? "bg-destructive" : burnPct >= 75 ? "bg-amber-500" : "bg-primary";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            AI Usage & Cost Control
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" variant="destructive" onClick={pauseAi} disabled={pausing}>
              <PauseCircle className="h-3.5 w-3.5 mr-1" />
              Pause AI 30m
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* MTD stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="MTD Spend" value={fmtUsd(mtd.totalCost)} sub={`Budget ${fmtUsd(mtd.monthlyBudget)}`} />
          <Stat label="MTD Calls" value={mtd.totalCalls.toLocaleString()} />
          <Stat label="Tokens In" value={mtd.totalTokensIn.toLocaleString()} />
          <Stat label="Tokens Out" value={mtd.totalTokensOut.toLocaleString()} />
        </div>

        {/* Budget burn */}
        {mtd.monthlyBudget > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Monthly budget burn</span>
              <span className="font-medium">{burnPct.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-muted rounded overflow-hidden">
              <div className={`h-full ${burnColor} transition-all`} style={{ width: `${burnPct}%` }} />
            </div>
          </div>
        )}

        {/* Per-function breakdown */}
        <div>
          <h4 className="text-sm font-medium mb-2">By feature (MTD)</h4>
          <div className="space-y-1.5">
            {Object.entries(data.byFunction)
              .sort((a, b) => b[1].cost - a[1].cost)
              .map(([name, v]) => (
                <div key={name} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0">
                  <span className="font-mono">{name}</span>
                  <span className="flex items-center gap-3">
                    <span>{v.calls.toLocaleString()} calls</span>
                    {v.blocked > 0 && <Badge variant="outline" className="text-amber-600">{v.blocked} blocked</Badge>}
                    <span className="text-muted-foreground tabular-nums">{fmtUsd(v.cost)}</span>
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Top consumers */}
        {data.topUsers.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Top consumers (MTD)</h4>
            <div className="space-y-1">
              {data.topUsers.slice(0, 5).map((u) => (
                <div key={u.actor_id} className="flex items-center justify-between text-xs py-1">
                  <span className="font-mono truncate max-w-[60%]">{u.actor_id.slice(0, 8)}… <Badge variant="outline" className="ml-1">{u.actorRole ?? "?"}</Badge></span>
                  <span className="tabular-nums text-muted-foreground">{u.calls} · {fmtUsd(u.cost)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent denials */}
        {data.recentDenials.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Recent denials (24h)
            </h4>
            <div className="space-y-1 max-h-48 overflow-auto">
              {data.recentDenials.slice(0, 15).map((d) => (
                <div key={d.id} className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0">
                  <span className="font-mono">{d.function_name}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="text-amber-600">{d.error_code ?? d.status}</Badge>
                    <span className="text-muted-foreground">{new Date(d.created_at).toLocaleTimeString()}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
