import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Zap, Copy, RefreshCw } from "lucide-react";

interface WebhookStatus {
  configured: boolean;
  url?: string | null;
  pending_update_count?: number;
  last_error_message?: string | null;
  last_error_date?: number | null;
  error?: string;
}

export function TelegramWebhookControl() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activating, setActivating] = useState(false);

  const { data, isLoading, refetch } = useQuery<WebhookStatus>({
    queryKey: ["telegram-webhook-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("telegram-check-webhook");
      if (error) throw error;
      return data as WebhookStatus;
    },
  });

  const handleActivate = async () => {
    setActivating(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke("telegram-register-webhook");
      if (error) throw error;
      if (resp?.error === "no_token") {
        toast({ title: "Add your bot token first", description: "Paste the token from BotFather above, save it, then try again.", variant: "destructive" });
        return;
      }
      if (resp?.error) {
        toast({ title: "Activation failed", description: resp.description ?? resp.error, variant: "destructive" });
        return;
      }
      toast({ title: "Webhook active", description: "Your bot is now live." });
      qc.invalidateQueries({ queryKey: ["telegram-webhook-status"] });
    } catch (err: any) {
      toast({ title: "Activation failed", description: err.message, variant: "destructive" });
    } finally {
      setActivating(false);
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
          ) : data?.last_error_message ? (
            <Badge variant="outline" className="text-[10px] gap-1 text-destructive border-destructive/40 bg-destructive/10">
              <XCircle className="h-3 w-3" /> Error
            </Badge>
          ) : data?.configured ? (
            <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950">
              <CheckCircle2 className="h-3 w-3" /> Active
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

      {data?.last_error_message && (
        <p className="text-xs text-destructive">
          Telegram reports: {data.last_error_message}
        </p>
      )}

      {!data?.configured && !isLoading && (
        <p className="text-xs text-muted-foreground">
          After saving your bot token, click <strong>Activate Webhook</strong> to go live. Inbound messages will route through Kru Glitch in real time.
        </p>
      )}

      {data?.configured && (
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh status
        </Button>
      )}
    </div>
  );
}
