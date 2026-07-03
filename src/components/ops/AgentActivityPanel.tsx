import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Bot, RefreshCw, CheckCircle2, XCircle } from "lucide-react";

interface McpActivityRow {
  id: string;
  user_id: string | null;
  tool_name: string;
  client_name: string | null;
  client_id: string | null;
  success: boolean;
  error_message: string | null;
  row_count: number | null;
  duration_ms: number | null;
  created_at: string;
}

/**
 * Admin-only view of external agent activity (ChatGPT, Claude, Cursor…)
 * hitting the app's MCP server. Backed by `public.mcp_activity`.
 */
export function AgentActivityPanel() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["mcp-activity"],
    queryFn: async (): Promise<McpActivityRow[]> => {
      const { data, error } = await supabase
        .from("mcp_activity")
        .select("id, user_id, tool_name, client_name, client_id, success, error_message, row_count, duration_ms, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as McpActivityRow[];
    },
    refetchInterval: 30_000,
  });

  const rows = data ?? [];
  const total24h = rows.filter((r) => Date.now() - new Date(r.created_at).getTime() < 86_400_000).length;
  const failures24h = rows.filter(
    (r) => !r.success && Date.now() - new Date(r.created_at).getTime() < 86_400_000,
  ).length;

  // Per-tool counts (24h)
  const perTool = new Map<string, number>();
  for (const r of rows) {
    if (Date.now() - new Date(r.created_at).getTime() < 86_400_000) {
      perTool.set(r.tool_name, (perTool.get(r.tool_name) ?? 0) + 1);
    }
  }

  // Distinct clients seen in last 7d
  const clients = new Set<string>();
  for (const r of rows) {
    if (Date.now() - new Date(r.created_at).getTime() < 7 * 86_400_000) {
      clients.add(r.client_name ?? r.client_id ?? "unknown");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Every tool call an external agent (ChatGPT, Claude, Cursor…) makes against your MCP server. RLS-scoped — agents only see what the signed-in user is allowed to see.
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Tool calls · 24h</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{total24h}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Failures · 24h</CardTitle></CardHeader>
          <CardContent><p className={`text-2xl font-bold ${failures24h > 0 ? "text-rose-600" : ""}`}>{failures24h}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Distinct clients · 7d</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{clients.size}</p></CardContent>
        </Card>
      </div>

      {perTool.size > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Per-tool volume (24h)</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {[...perTool.entries()]
              .sort(([, a], [, b]) => b - a)
              .map(([tool, count]) => (
                <Badge key={tool} variant="outline" className="text-xs">
                  {tool} · {count}
                </Badge>
              ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            Recent tool calls
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No agent activity yet. Connect ChatGPT, Claude, or Cursor to the MCP server and call a tool to see it here.
            </p>
          ) : (
            <div className="divide-y">
              {rows.slice(0, 50).map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
                  {r.success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{r.tool_name}</span>
                      {r.client_name && (
                        <Badge variant="outline" className="text-[10px]">{r.client_name}</Badge>
                      )}
                      {r.row_count != null && (
                        <span className="text-xs text-muted-foreground">→ {r.row_count} rows</span>
                      )}
                      {r.duration_ms != null && (
                        <span className="text-xs text-muted-foreground">· {r.duration_ms}ms</span>
                      )}
                    </div>
                    {r.error_message && (
                      <p className="text-xs text-rose-600 line-clamp-1">{r.error_message}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
