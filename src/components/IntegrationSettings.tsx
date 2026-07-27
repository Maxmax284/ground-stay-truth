import { useState } from "react";
import { VapidKeySettings } from "@/components/VapidKeySettings";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { usePolicySettings, useUpdatePolicySetting } from "@/hooks/usePolicySettings";
import { useSecretStatuses, useSetSecret, useDeleteSecret } from "@/hooks/useIntegrationSecrets";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, Mail, Eye, EyeOff, Save, CheckCircle2, XCircle, ShieldCheck, Plane, Trash2, Zap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MessagingBridgeSettings } from "@/components/MessagingBridgeSettings";
import { WebhookHealthCard } from "@/components/WebhookHealthCard";

const SECRET_KEYS = ["stripe_secret_key", "stripe_publishable_key", "stripe_webhook_secret", "resend_api_key", "fenrir_api_key", "fenrir_receive_token"];

export function IntegrationSettings() {
  const { t } = useTranslation();
  const { data: settings, isLoading: policiesLoading } = usePolicySettings();
  const { data: secretStatuses, isLoading: secretsLoading } = useSecretStatuses();
  const updateSetting = useUpdatePolicySetting();
  const setSecret = useSetSecret();
  const deleteSecret = useDeleteSecret();
  const { toast } = useToast();
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<null | {
    ok: boolean; status?: number; duration_ms?: number; within_sla?: boolean;
    correlation_id?: string; network_error?: string | null; response_preview?: string;
    missing?: string[]; message?: string; error?: string;
  }>(null);

  const handleFenrirPing = async () => {
    setPinging(true);
    setPingResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("fenrir-test-ping", { body: {} });
      if (error) throw error;
      setPingResult(data);
      toast({
        title: data?.ok ? "Fenrir ping successful" : "Fenrir ping failed",
        description: data?.ok
          ? `Round-trip ${data.duration_ms}ms · HTTP ${data.status}`
          : data?.network_error || data?.message || `HTTP ${data?.status ?? "?"}`,
        variant: data?.ok ? "default" : "destructive",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ping failed";
      setPingResult({ ok: false, error: msg });
      toast({ title: "Fenrir ping failed", description: msg, variant: "destructive" });
    } finally {
      setPinging(false);
    }
  };

  const isLoading = policiesLoading || secretsLoading;
  if (isLoading) return <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  const getSetting = (key: string) => settings?.find((s) => s.key === key);
  const getValue = (key: string) => {
    const s = getSetting(key);
    if (!s) return "";
    const v = String(s.value).replace(/^"|"$/g, "");
    return v;
  };

  // For secret keys, use the secure status endpoint
  const isSecretConfigured = (key: string) => {
    if (SECRET_KEYS.includes(key)) {
      return secretStatuses?.[key]?.configured ?? false;
    }
    const v = getValue(key);
    return v.length > 3;
  };

  const isConfigured = (key: string) => isSecretConfigured(key);

  const getEditValue = (key: string) => editValues[key] ?? "";
  const isDirty = (key: string) => (editValues[key] ?? "").length > 0;

  const handleSaveSecret = async (key: string) => {
    const value = editValues[key];
    if (!value || value.length < 3) return;
    try {
      await setSecret.mutateAsync({ key, value });
      toast({ title: "Saved securely", description: `${key} updated and secured.` });
      setEditValues((prev) => { const next = { ...prev }; delete next[key]; return next; });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteSecret = async (key: string) => {
    try {
      await deleteSecret.mutateAsync(key);
      toast({ title: "Removed", description: `${key} has been removed.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleSavePolicy = async (key: string) => {
    const setting = getSetting(key);
    if (!setting) return;
    const value = editValues[key];
    if (value === undefined) return;
    try {
      await updateSetting.mutateAsync({ id: setting.id, value });
      toast({ title: "Saved", description: `${key} updated.` });
      setEditValues((prev) => { const next = { ...prev }; delete next[key]; return next; });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleToggle = async (key: string, checked: boolean) => {
    const setting = getSetting(key);
    if (!setting) return;
    try {
      await updateSetting.mutateAsync({ id: setting.id, value: String(checked) });
      toast({ title: "Saved", description: `${key} updated.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const renderSecretField = (key: string, label: string, placeholder: string) => {
    const configured = isSecretConfigured(key);
    const visible = showSecrets[key];
    const currentEdit = editValues[key] ?? "";

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{label}</Label>
          {configured ? (
            <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950">
              <CheckCircle2 className="h-3 w-3" /> Secured
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
              <XCircle className="h-3 w-3" /> Not set
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              type={visible ? "text" : "password"}
              value={currentEdit}
              onChange={(e) => setEditValues((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder={configured ? "••••••••••••" : placeholder}
              className="pr-10 font-mono text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }))}
            >
              {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {isDirty(key) && (
            <Button size="icon" variant="outline" onClick={() => handleSaveSecret(key)} disabled={setSecret.isPending}>
              <Save className="h-4 w-4" />
            </Button>
          )}
          {configured && !isDirty(key) && (
            <Button size="icon" variant="outline" className="text-destructive" onClick={() => handleDeleteSecret(key)} disabled={deleteSecret.isPending}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {configured && (
          <p className="text-[10px] text-muted-foreground">
            Value is stored securely and never sent back to the browser. Enter a new value to replace it.
          </p>
        )}
      </div>
    );
  };

  const stripeEnabled = getValue("stripe_enabled") === "true";
  const depositsOnlineEnabled = getValue("deposits_online_enabled") === "true";

  return (
    <div className="space-y-6">
      {/* Plain-English Stripe status + write-only signing secret + self-test.
          Isolated so a failure here can't take the rest of Integrations down. */}
      <ErrorBoundary inline label="Stripe connection">
        <StripeConnectionStatus />
      </ErrorBoundary>

      {/* Stripe Section */}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Stripe Payments</CardTitle>
                <CardDescription>Accept online deposits and payments from guests</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="stripe-toggle" className="text-sm text-muted-foreground">Enabled</Label>
              <Switch
                id="stripe-toggle"
                checked={stripeEnabled}
                onCheckedChange={(checked) => handleToggle("stripe_enabled", checked)}
                disabled={updateSetting.isPending}
              />
            </div>
          </div>
        </CardHeader>
        {stripeEnabled && (
          <CardContent className="space-y-4">
            {renderSecretField("stripe_publishable_key", "Publishable Key", "pk_test_...")}
            {renderSecretField("stripe_secret_key", "Secret Key", "sk_test_...")}
            {renderSecretField("stripe_webhook_secret", "Webhook Secret", "whsec_...")}
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Online Deposits</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Allow guests to pay deposits online during booking
                </p>
              </div>
              <Switch
                checked={depositsOnlineEnabled}
                onCheckedChange={(checked) => handleToggle("deposits_online_enabled", checked)}
                disabled={updateSetting.isPending}
              />
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p><strong>Webhook URL:</strong> Set this in your Stripe dashboard:</p>
              <code className="block bg-background rounded px-2 py-1 text-[11px] break-all">
                {import.meta.env.VITE_SUPABASE_URL}/functions/v1/payment-webhook
              </code>
              <p>Events to listen for: <code>checkout.session.completed</code>, <code>charge.refunded</code></p>
            </div>
            <WebhookHealthCard />
          </CardContent>
        )}
      </Card>

      {/* Email Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Transactional Email</CardTitle>
              <CardDescription>Automated booking confirmations, reminders, and follow-ups</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderSecretField("resend_api_key", "Resend API Key", "re_...")}
          <div className="space-y-2">
            <Label className="text-sm font-medium">From Email</Label>
            <div className="flex items-center gap-2">
              <Input
                value={editValues["resend_from_email"] ?? getValue("resend_from_email")}
                onChange={(e) => setEditValues((prev) => ({ ...prev, resend_from_email: e.target.value }))}
                placeholder="noreply@yourdomain.com"
                className="flex-1 text-sm"
              />
              {(editValues["resend_from_email"] !== undefined && editValues["resend_from_email"] !== getValue("resend_from_email")) && (
                <Button size="icon" variant="outline" onClick={() => handleSavePolicy("resend_from_email")} disabled={updateSetting.isPending}>
                  <Save className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Must be a verified domain in your Resend account
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Security Telemetry Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Security Monitoring</CardTitle>
                <CardDescription>Real-time threat detection and security event telemetry</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="fenrir-toggle" className="text-sm text-muted-foreground">Enabled</Label>
              <Switch
                id="fenrir-toggle"
                checked={getValue("fenrir_enabled") === "true"}
                onCheckedChange={(checked) => handleToggle("fenrir_enabled", checked)}
                disabled={updateSetting.isPending}
              />
            </div>
          </div>
        </CardHeader>
        {getValue("fenrir_enabled") === "true" && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Ingestion Endpoint</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={editValues["fenrir_endpoint"] ?? getValue("fenrir_endpoint")}
                  onChange={(e) => setEditValues((prev) => ({ ...prev, fenrir_endpoint: e.target.value }))}
                  placeholder="https://your-endpoint.supabase.co/functions/v1/ingest-webhook"
                  className="flex-1 font-mono text-xs"
                />
                {(editValues["fenrir_endpoint"] !== undefined && editValues["fenrir_endpoint"] !== getValue("fenrir_endpoint")) && (
                  <Button size="icon" variant="outline" onClick={() => handleSavePolicy("fenrir_endpoint")} disabled={updateSetting.isPending}>
                    <Save className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                The URL where security events are sent for analysis
              </p>
            </div>
            {renderSecretField("fenrir_api_key", "Outbound API Key", "flk_...")}
            {renderSecretField("fenrir_receive_token", "Inbound Webhook Token", "frt_...")}
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-sm font-medium">Live connection test</Label>
                  <p className="text-xs text-muted-foreground">Sends a signed <code className="text-[10px]">system.integration_test</code> event and reports round-trip status.</p>
                </div>
                <Button size="sm" onClick={handleFenrirPing} disabled={pinging}>
                  {pinging ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Zap className="h-4 w-4 mr-1.5" />}
                  Send Test Ping
                </Button>
              </div>
              {pingResult && (
                <div className={`rounded-md border p-3 text-xs space-y-1 ${pingResult.ok ? "border-green-500/40 bg-green-500/5" : "border-destructive/40 bg-destructive/5"}`}>
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    {pingResult.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
                    {pingResult.ok
                      ? `Delivered · HTTP ${pingResult.status} · ${pingResult.duration_ms}ms${pingResult.within_sla ? " (within 10s SLA)" : ""}`
                      : "Ping failed"}
                  </div>
                  {pingResult.correlation_id && (
                    <p className="font-mono text-[10px] text-muted-foreground">correlation_id: {pingResult.correlation_id}</p>
                  )}
                  {pingResult.missing?.length ? (
                    <p className="text-muted-foreground">Missing config: {pingResult.missing.join(", ")}</p>
                  ) : null}
                  {pingResult.network_error && <p className="text-muted-foreground">Network: {pingResult.network_error}</p>}
                  {pingResult.error && <p className="text-muted-foreground">{pingResult.error}</p>}
                  {pingResult.response_preview && (
                    <pre className="mt-1 max-h-24 overflow-auto rounded bg-background/60 p-2 font-mono text-[10px]">{pingResult.response_preview}</pre>
                  )}
                </div>
              )}
            </div>
            <Separator />
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground">What this does</p>
              <p>When enabled, security-relevant events — such as logins, role changes, payment anomalies, and data exports — are streamed to your monitoring endpoint for threat analysis and compliance auditing.</p>
              <p>Events are batched and sent in the background. Telemetry failures never affect normal platform operations.</p>
            </div>
          </CardContent>
        )}
      </Card>

      <VapidKeySettings />

      <MessagingBridgeSettings />

      {/* Flight Forecast Toggle */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-3">
            <Plane className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Flight Forecast</CardTitle>
              <CardDescription className="text-xs">
                Airport traffic monitor for BKK &amp; Samui
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={getValue("flight_forecast_enabled") === "true"}
            onCheckedChange={(checked) => handleToggle("flight_forecast_enabled", checked)}
            disabled={updateSetting.isPending}
          />
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1.5">
            <p className="font-medium text-foreground">What this does</p>
            <p>When enabled, the dashboard shows a live flight board with all arrivals and departures at BKK and USM airports. Flights linked to guest bookings are highlighted automatically. Data refreshes every 30 minutes via AviationStack (requires a paid plan for airport-level queries).</p>
            <p>Disable this to hide the widget and conserve API usage.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
