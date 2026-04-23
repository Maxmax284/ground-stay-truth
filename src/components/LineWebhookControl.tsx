import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Zap, Copy, RefreshCw, Send } from "lucide-react";

interface WebhookStatus {
  configured: boolean;
  url?: string | null;
  active?: boolean | null;
  error?: string;
}

export function LineWebhookControl() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activating, setActivating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data, isLoading, refetch } = useQuery<WebhookStatus>({
    queryKey: ["line-webhook-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("line-check-webhook");
      if (error) throw error;
      return data as WebhookStatus;
    },
  });

  const handleActivate = async () => {
    setActivating(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke("line-register-webhook");
      if (error) throw error;
      if (resp?.error === "missing_credentials") {
        toast({ title: "Add credentials first", description: "Save Channel Access Token and Channel Secret above, then try again.", variant: "destructive" });
        return;
      }
      if (resp?.error) {
        toast({ title: "Activation failed", description: resp.description ?? resp.error, variant: "destructive" });
        return;
      }
      const test = resp?.test;
      if (test && test.success === false) {
        toast({
          title: "Webhook saved, but LINE's test ping failed",
          description: `${test.statusCode ?? "?"} ${test.reason ?? "unknown"}`.slice(0, 200),
          variant: "destructive",
        });
      } else {
        toast({ title: "Webhook active", description: "LINE is now routed through Kru Glitch." });
      }
      qc.invalidateQueries({ queryKey: ["line-webhook-status"] });
    } catch (err: any) {
      toast({ title: "Activation failed", description: err.message, variant: "destructive" });
    } finally {
      setActivating(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data: resp, error } = await supabase.functions.invoke("messaging-system-ping", {
        body: { channel: "line" },
      });
      if (error) throw error;
      if (resp?.error) throw new Error(resp.error);
      const sent = resp?.sent ?? 0;
      const failed = resp?.failed ?? 0;
      const total = resp?.total ?? 0;
      setTestResult({
        ok: sent > 0 || failed === 0,
        message: `${sent} delivered, ${failed} failed (of ${total} linked LINE chats).`,
      });
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message ?? "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied" });
  };

  const truncate = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Webhook</span>
          {isLoading ? (
            <Badge variant="outline" className="text-[10px] gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Checking…</Badge>
          ) : data?.error ? (
            <Badge variant="outline" className="text-[10px] gap-1 text-destructive border-destructive/40 bg-destructive/10">
              <XCircle className="h-3 w-3" /> Error
            </Badge>
          ) : data?.configured && data.active !== false ? (
            <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950">
              <CheckCircle2 className="h-3 w-3" /> Active
            </Badge>
          ) : data?.configured ? (
            <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950">
              <AlertTriangle className="h-3 w-3" /> Inactive
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950">
              <AlertTriangle className="h-3 w-3" /> Not activated
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data?.configured ? (
            <Button size="sm" variant="outline" onClick={handleActivate} disabled={activating}>
              {activating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
              Re-register
            </Button>
          ) : (
            <Button size="sm" onClick={handleActivate} disabled={activating}>
              {activating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
              Activate Webhook
            </Button>
          )}
        </div>
      </div>

      {data?.configured && data.url && (
        <div className="flex items-center gap-2">
          <code className="block flex-1 bg-background rounded px-2 py-1 text-[11px] break-all">{truncate(data.url)}</code>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(data.url!)}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {data?.error && (
        <p className="text-xs text-destructive">LINE reports: {data.error}</p>
      )}

      {!data?.configured && !isLoading && (
        <p className="text-xs text-muted-foreground">
          After saving your Channel Access Token and Channel Secret, click <strong>Activate Webhook</strong>. Inbound LINE messages will route through Kru Glitch.
        </p>
      )}

      {data?.configured && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
            Send test message
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh status
          </Button>
        </div>
      )}

      {testResult && (
        <p className={`text-xs ${testResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {testResult.ok ? "✓ " : "✗ "}{testResult.message}
        </p>
      )}
    </div>
  );
}
