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
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, KeyRound, PauseCircle, Send } from "lucide-react";

export function VantaIntegrationPanel() {
  const { data: session, isLoading } = useVantaSession();
  const update = useUpdateVantaSession();
  const { data: secrets } = useSecretStatuses();
  const setSecret = useSetSecret();
  const { data: logs } = useVantaEventLog(50);
  const sendTest = useSendVantaTestEvent();

  const [url, setUrl] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [ownerIdentifier, setOwnerIdentifier] = useState<string | null>(null);
  const [secretInput, setSecretInput] = useState("");
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);

  if (isLoading || !session) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  const secretConfigured = !!secrets?.["vanta_webhook_secret"]?.configured;
  const effectiveUrl = url || session.vanta_webhook_url || "";
  const effectiveSource = sourceId || session.source_id || "";
  const effectiveOwnerIdentifier = ownerIdentifier ?? session.vanta_owner_identifier ?? "";

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
      vanta_owner_identifier: effectiveOwnerIdentifier.trim() || null,
      identity_strategy: effectiveOwnerIdentifier.trim() ? "vanta_owner" : "payload_user",
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

  const generateSecret = async () => {
    // 32 random bytes → base64url, ~43 chars. Strong enough for HMAC-SHA256.
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const b64 = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const value = `vws_${b64}`;
    await setSecret.mutateAsync({ key: "vanta_webhook_secret", value });
    await update.mutateAsync({ shared_secret_configured: true });
    setGeneratedSecret(value);
    toast({ title: "Secret generated", description: "Copy it now and paste into Vanta. It won't be shown again." });
  };

  const copyGenerated = async () => {
    if (!generatedSecret) return;
    try {
      await navigator.clipboard.writeText(generatedSecret);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", description: "Select and copy manually.", variant: "destructive" });
    }
  };

  const handleTest = async () => {
    try {
      const res: any = await sendTest.mutateAsync();
      const code = Number(res?.response_code ?? 0);
      // Trust the HTTP code first. ok is only false when Vanta actually rejected (4xx/5xx).
      const accepted = code >= 200 && code < 300;
      if (accepted) {
        toast({
          title: "Test event accepted",
          description: `Vanta responded ${code}. Health reset to live.`,
        });
      } else {
        toast({
          title: "Test event not accepted",
          description: `Response code: ${code || "n/a"}${res?.status ? ` · ${res.status}` : ""}`,
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    }
  };

  const resetHealth = async () => {
    await update.mutateAsync({
      status: session.enabled && session.vanta_webhook_url ? "live" : "configured",
      failure_count: 0,
      last_error_summary: null,
      last_failure_at: null,
    } as any);
    toast({ title: "Health reset", description: "Stale failure state cleared." });
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
            <Label>Vanta owner identifier</Label>
            <Input
              value={effectiveOwnerIdentifier}
              onChange={(e) => setOwnerIdentifier(e.target.value)}
              placeholder="Vanta user, workspace, org, or service account ID"
            />
            <p className="text-xs text-muted-foreground">
              Used as the root user_id Vanta authorizes against. Event payloads still keep the original local actor IDs inside payload.
            </p>
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
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={generateSecret}
                disabled={setSecret.isPending}
              >
                <KeyRound className="h-4 w-4 mr-2" />
                {secretConfigured ? "Generate & rotate" : "Generate secret"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Creates a strong random secret. Paste it into Vanta's webhook config.
              </span>
            </div>
            {generatedSecret && (
              <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                <div className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Copy this now — it won't be shown again
                </div>
                <div className="flex gap-2">
                  <Input readOnly value={generatedSecret} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button type="button" size="sm" variant="secondary" onClick={copyGenerated}>
                    <Copy className="h-4 w-4 mr-1" /> Copy
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setGeneratedSecret(null)}>
                    Done
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Paste into Vanta's "Webhook signing secret" field for this source, then click Done.
                </div>
              </div>
            )}
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
