import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { useVantaSession, useUpdateVantaSession, useVantaEventLog, useSendVantaTestEvent } from "@/hooks/useVantaIntegration";
import { useSecretStatuses, useSetSecret } from "@/hooks/useIntegrationSecrets";
import { VANTA_EVENT_TYPES, VANTA_EVENT_LABELS, VANTA_EVENT_SENSITIVE, type VantaEventType } from "@/lib/vanta/events";
import { AlertTriangle, CheckCircle2, ChevronDown, PauseCircle, Send } from "lucide-react";

export function VantaIntegrationPanel() {
  const { data: session, isLoading } = useVantaSession();
  const update = useUpdateVantaSession();
  const { data: secrets } = useSecretStatuses();
  const setSecret = useSetSecret();
  const { data: logs } = useVantaEventLog(50);
  const sendTest = useSendVantaTestEvent();

  const [url, setUrl] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [secretInput, setSecretInput] = useState("");

  if (isLoading || !session) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  const secretConfigured = !!secrets?.["vanta_webhook_secret"]?.configured;
  const effectiveUrl = url || session.vanta_webhook_url || "";
  const effectiveSource = sourceId || session.source_id || "";

  const statusBadge = () => {
    if (!session.enabled) return <Badge variant="secondary">Paused</Badge>;
    if (!session.vanta_webhook_url) return <Badge variant="outline">Needs setup</Badge>;
    if (!secretConfigured) return <Badge variant="outline">Needs secret</Badge>;
    if (session.status === "error") return <Badge variant="destructive">Error</Badge>;
    if (session.status === "live") return <Badge>Live</Badge>;
    return <Badge variant="outline">Configured</Badge>;
  };

  const toggleEvent = async (evt: VantaEventType, on: boolean) => {
    const next = on
      ? Array.from(new Set([...(session.allowed_events ?? []), evt]))
      : (session.allowed_events ?? []).filter((e) => e !== evt);
    await update.mutateAsync({ allowed_events: next });
  };

  const saveConnection = async () => {
    await update.mutateAsync({
      vanta_webhook_url: effectiveUrl || null,
      source_id: effectiveSource || "gth_main",
      status: effectiveUrl ? "configured" : "needs_setup",
    });
    toast({ title: "Saved", description: "Connection updated." });
  };

  const saveSecret = async () => {
    if (!secretInput.trim()) return;
    await setSecret.mutateAsync({ key: "vanta_webhook_secret", value: secretInput.trim() });
    await update.mutateAsync({ shared_secret_configured: true });
    setSecretInput("");
    toast({ title: "Secret saved" });
  };

  const handleTest = async () => {
    try {
      const res = await sendTest.mutateAsync();
      const ok = (res as any)?.ok;
      toast({
        title: ok ? "Test event accepted" : "Test event failed",
        description: `Response code: ${(res as any)?.response_code ?? "n/a"}`,
        variant: ok ? "default" : "destructive",
      });
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    }
  };

  const toggleEnabled = async (on: boolean) => {
    await update.mutateAsync({ enabled: on, status: on ? "live" : "paused" });
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Vanta? This stops future sync. Existing platform records stay here. Existing Vanta drafts are not deleted.")) return;
    await update.mutateAsync({
      enabled: false,
      vanta_webhook_url: null,
      status: "needs_setup",
    });
    toast({ title: "Disconnected" });
  };

  const changeEnvironment = async (env: "sandbox" | "production") => {
    if (env === "production" && !confirm("Production sync sends real platform signals to Vanta. Vanta still drafts first. Nothing executes without approval. Continue?")) return;
    await update.mutateAsync({ environment: env });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Vanta Integration Session</h2>
        <p className="text-sm text-muted-foreground mt-1">
          This platform sends signals to Vanta. Vanta turns them into drafts. Nothing executes without approval.
        </p>
      </div>

      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            Status {statusBadge()}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Stat label="Environment" value={session.environment} />
          <Stat label="Failure count" value={String(session.failure_count)} />
          <Stat label="Last success" value={fmt(session.last_success_at)} />
          <Stat label="Last failure" value={fmt(session.last_failure_at)} />
          {session.last_error_summary && (
            <div className="col-span-2 sm:col-span-4 text-xs text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span className="break-all">{session.last_error_summary}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection</CardTitle>
          <CardDescription>Where signals get sent and how they're signed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Vanta webhook URL</Label>
            <Input
              value={url || session.vanta_webhook_url || ""}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://vanta.example.com/api/inbound"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Source ID</Label>
              <Input
                value={sourceId || session.source_id}
                onChange={(e) => setSourceId(e.target.value)}
                placeholder="gth_main"
              />
            </div>
            <div className="space-y-2">
              <Label>Environment</Label>
              <Select value={session.environment} onValueChange={(v) => changeEnvironment(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Shared signing secret</Label>
            <div className="flex items-center gap-2 text-sm">
              {secretConfigured ? (
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" /> Configured
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-4 w-4" /> Missing
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                placeholder={secretConfigured ? "Enter new value to rotate" : "Paste signing secret"}
              />
              <Button onClick={saveSecret} disabled={!secretInput || setSecret.isPending}>
                {secretConfigured ? "Rotate" : "Set"}
              </Button>
            </div>
          </div>

          <Button onClick={saveConnection} disabled={update.isPending}>Save connection</Button>
        </CardContent>
      </Card>

      {/* Allowed events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Allowed events</CardTitle>
          <CardDescription>Only checked events are sent to Vanta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {VANTA_EVENT_TYPES.map((evt) => {
            const checked = (session.allowed_events ?? []).includes(evt);
            return (
              <label key={evt} className="flex items-center justify-between py-2 border-b last:border-0 cursor-pointer">
                <div className="flex items-center gap-3">
                  <Checkbox checked={checked} onCheckedChange={(v) => toggleEvent(evt, !!v)} />
                  <div>
                    <div className="text-sm font-medium">{VANTA_EVENT_LABELS[evt]}</div>
                    <div className="text-xs text-muted-foreground">{evt}</div>
                  </div>
                </div>
                {VANTA_EVENT_SENSITIVE[evt] && <Badge variant="outline" className="text-xs">Sensitive</Badge>}
              </label>
            );
          })}
        </CardContent>
      </Card>

      {/* Callbacks (read-only) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Callbacks</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Callback mode: <strong>None (inbound only)</strong>. Approved callbacks will be added in a later pass.
        </CardContent>
      </Card>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium flex items-center gap-2">
                <PauseCircle className="h-4 w-4" /> Sync enabled
              </div>
              <div className="text-xs text-muted-foreground">
                When paused, this platform stops sending new signals to Vanta. Existing records stay untouched.
              </div>
            </div>
            <Switch checked={session.enabled} onCheckedChange={toggleEnabled} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleTest} disabled={sendTest.isPending} variant="secondary">
              <Send className="h-4 w-4 mr-2" /> Send test event
            </Button>
            <Button onClick={disconnect} variant="destructive">Disconnect</Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent events</CardTitle>
          <CardDescription>Last 50 outbound deliveries.</CardDescription>
        </CardHeader>
        <CardContent>
          {!logs?.length ? (
            <div className="text-sm text-muted-foreground">No events yet.</div>
          ) : (
            <div className="space-y-2">
              {logs.slice(0, 10).map((row) => <LogRow key={row.id} row={row} />)}
              {logs.length > 10 && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full">
                      <ChevronDown className="h-4 w-4 mr-2" /> Show {logs.length - 10} more
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 pt-2">
                    {logs.slice(10).map((row) => <LogRow key={row.id} row={row} />)}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5 break-words">{value}</div>
    </div>
  );
}

function LogRow({ row }: { row: any }) {
  const variant =
    row.status === "accepted" ? "default" :
    row.status === "rejected" || row.status === "failed" ? "destructive" : "secondary";
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{row.event_type}</div>
        <div className="text-xs text-muted-foreground">
          {fmt(row.created_at)} · code {row.vanta_response_code ?? "—"} · retries {row.retry_count}
        </div>
        {row.error_summary && (
          <div className="text-xs text-destructive truncate">{row.error_summary}</div>
        )}
      </div>
      <Badge variant={variant as any} className="ml-2 flex-shrink-0">{row.status}</Badge>
    </div>
  );
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
