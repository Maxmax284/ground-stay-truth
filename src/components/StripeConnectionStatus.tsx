import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSecretStatuses, useSetSecret } from "@/hooks/useIntegrationSecrets";
import { CheckCircle2, AlertTriangle, Clock, CreditCard, Loader2, Save, Zap } from "lucide-react";

/**
 * StripeConnectionStatus
 * ---------------------------------------------------------------------------
 * Self-contained, crash-resistant panel for the one thing that must never be
 * un-fixable from the UI: the Stripe webhook signing secret.
 *
 * Deliberately does NOT depend on policy settings, property context, or any
 * other panel. It can be mounted standalone (see /stripe-setup) so a render
 * failure elsewhere in Settings can't lock an admin out of this control.
 *
 * The secret value is write-only. It is never read back into the browser and
 * is only ever displayed masked (whsec_••••••••).
 */

type Diagnostics = {
  stripe_mode?: string;
  webhook_secret_configured?: boolean;
  webhook_health?: {
    status?: string | null;
    last_received_at?: string | null;
    last_success_at?: string | null;
    last_failure_at?: string | null;
    last_failure_reason?: string | null;
  } | null;
  smoke_test_passed?: boolean;
  live_safe?: boolean;
  next_action?: string;
  warnings?: string[];
};

type SelfTest = {
  ok?: boolean;
  stage?: string;
  error?: string;
  hint?: string;
  message?: string;
  webhook_status?: number;
};

function fmt(ts?: string | null) {
  if (!ts) return "Never";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString();
}

export function StripeConnectionStatus() {
  const { toast } = useToast();
  const setSecret = useSetSecret();
  const { data: secretStatuses } = useSecretStatuses();
  const [value, setValue] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<SelfTest | null>(null);

  const diagnostics = useQuery<Diagnostics>({
    queryKey: ["payment-diagnostics"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("payment-diagnostics", { body: {} });
      if (error) throw error;
      return (data ?? {}) as Diagnostics;
    },
    retry: 1,
    staleTime: 15_000,
  });

  const d = diagnostics.data ?? {};
  const health = d.webhook_health ?? null;
  const secretConfigured =
    d.webhook_secret_configured ?? secretStatuses?.["stripe_webhook_secret"]?.configured ?? false;
  const updatedAt = secretStatuses?.["stripe_webhook_secret"]?.updated_at ?? null;

  const reason = health?.last_failure_reason ?? "";
  const isUnsignedProbe = /missing stripe-signature/i.test(reason);
  const signingState: "connected" | "mismatch" | "missing" | "awaiting" = !secretConfigured
    ? "missing"
    : health?.status === "failing" && !isUnsignedProbe
      ? "mismatch"
      : health?.last_success_at || d.smoke_test_passed
        ? "connected"
        : "awaiting";

  const headline =
    signingState === "connected"
      ? "Stripe can collect payments and CampStay is confirming them automatically."
      : signingState === "mismatch"
        ? "Stripe can collect payments, but CampStay cannot safely confirm them until the webhook signing secret matches."
        : signingState === "missing"
          ? "Stripe can collect payments, but CampStay has no webhook signing secret on file, so nothing gets confirmed automatically."
          : "Stripe is configured. CampStay is waiting on its first verified webhook — run the self-test below to prove the handshake.";

  const badge =
    signingState === "connected"
      ? { label: "Webhook signing: connected", icon: CheckCircle2, variant: "default" as const }
      : signingState === "mismatch"
        ? { label: "Webhook signing: mismatch", icon: AlertTriangle, variant: "destructive" as const }
        : signingState === "missing"
          ? { label: "Webhook signing: missing", icon: AlertTriangle, variant: "destructive" as const }
          : { label: "Webhook signing: awaiting test", icon: Clock, variant: "secondary" as const };
  const BadgeIcon = badge.icon;

  const trimmed = value.trim();
  const looksValid = trimmed.startsWith("whsec_") && trimmed.length >= 24;

  const handleSave = async () => {
    if (!looksValid) {
      toast({
        title: "That doesn't look right",
        description: "A Stripe signing secret starts with whsec_ and is about 35 characters.",
        variant: "destructive",
      });
      return;
    }
    try {
      await setSecret.mutateAsync({ key: "stripe_webhook_secret", value: trimmed });
      setValue("");
      setTestResult(null);
      toast({
        title: "Signing secret saved",
        description: "Stored securely. Run the self-test to confirm the handshake.",
      });
      diagnostics.refetch();
    } catch (err) {
      toast({
        title: "Couldn't save",
        description: err instanceof Error ? err.message : "Save failed",
        variant: "destructive",
      });
    }
  };

  const handleSelfTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-webhook-selftest", { body: {} });
      if (error && !data) throw error;
      const res = (data ?? {}) as SelfTest;
      setTestResult(res);
      toast({
        title: res.ok ? "Self-test passed" : "Self-test failed",
        description: res.ok
          ? "Stripe's signature was accepted. No money moved."
          : res.hint || res.error || "Signature was rejected.",
        variant: res.ok ? "default" : "destructive",
      });
      diagnostics.refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Self-test failed";
      setTestResult({ ok: false, error: msg });
      toast({ title: "Self-test failed", description: msg, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Stripe Connection</CardTitle>
              <CardDescription>Checkout, webhook signing, and the handshake self-test</CardDescription>
            </div>
          </div>
          <Badge variant={badge.variant} className="gap-1.5">
            <BadgeIcon className="h-3 w-3" />
            {badge.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-foreground">{headline}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border bg-muted/40 p-2.5">
            <p className="text-muted-foreground">Stripe checkout</p>
            <p className="font-medium text-foreground">
              {d.stripe_mode === "live"
                ? "Active (live mode)"
                : d.stripe_mode === "test"
                  ? "Active (TEST mode — real cards won't charge)"
                  : d.stripe_mode === "not_configured"
                    ? "Not configured"
                    : diagnostics.isLoading
                      ? "Checking…"
                      : "Unknown"}
            </p>
          </div>
          <div className="rounded-md border bg-muted/40 p-2.5">
            <p className="text-muted-foreground">Signing secret on file</p>
            <p className="font-medium text-foreground font-mono">
              {secretConfigured ? "whsec_••••••••" : "None"}
            </p>
            {updatedAt && <p className="text-[10px] text-muted-foreground mt-0.5">Updated {fmt(updatedAt)}</p>}
          </div>
          <div className="rounded-md border bg-muted/40 p-2.5">
            <p className="text-muted-foreground">Last webhook received</p>
            <p className="font-medium text-foreground">{fmt(health?.last_received_at)}</p>
          </div>
          <div className="rounded-md border bg-muted/40 p-2.5">
            <p className="text-muted-foreground">Last webhook verified</p>
            <p className="font-medium text-foreground">{fmt(health?.last_success_at)}</p>
          </div>
        </div>

        {signingState === "mismatch" && reason && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs space-y-1">
            <p className="font-medium text-foreground">Why it's failing</p>
            <p className="text-muted-foreground">{reason}</p>
            <p className="text-muted-foreground">
              In plain English: Stripe is signing its messages with one password and CampStay is
              checking against a different one. Paste the current signing secret below to line them up.
            </p>
          </div>
        )}

        {/* Write-only secret entry */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Webhook signing secret</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={secretConfigured ? "Paste a new whsec_… to replace" : "whsec_…"}
              className="flex-1 font-mono text-xs"
            />
            <Button onClick={handleSave} disabled={!trimmed || setSecret.isPending} className="gap-1.5">
              {setSecret.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save secret
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Stripe → Developers → Webhooks → your endpoint → Signing secret → Reveal. The value is
            stored securely, never shown again, and never written to logs, alerts, or monitoring.
          </p>
        </div>

        {/* Self-test */}
        <div className="rounded-md border p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-foreground">Handshake self-test</p>
              <p className="text-xs text-muted-foreground">
                Sends CampStay a fake, correctly-signed Stripe message. No card is charged and no
                booking is touched.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={handleSelfTest} disabled={testing} className="gap-1.5">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Run self-test
            </Button>
          </div>
          {testResult && (
            <div
              className={`rounded-md border p-2.5 text-xs space-y-1 ${
                testResult.ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5"
              }`}
            >
              <p className="font-medium text-foreground flex items-center gap-1.5">
                {testResult.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                )}
                {testResult.ok ? "Signature accepted — Stripe and CampStay agree." : "Signature rejected."}
              </p>
              {(testResult.hint || testResult.error || testResult.message) && (
                <p className="text-muted-foreground">
                  {testResult.hint || testResult.error || testResult.message}
                </p>
              )}
            </div>
          )}
        </div>

        {!!d.next_action && !d.live_safe && (
          <div className="rounded-md bg-muted/50 p-3 text-xs">
            <p className="font-medium text-foreground">Action needed</p>
            <p className="text-muted-foreground">{d.next_action}</p>
          </div>
        )}

        {diagnostics.isError && (
          <p className="text-xs text-muted-foreground">
            Couldn't read live diagnostics right now. You can still paste and save the signing secret
            above, then run the self-test.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default StripeConnectionStatus;
