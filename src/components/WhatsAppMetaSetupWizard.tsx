// 5-step guided wizard for connecting WhatsApp via Meta Cloud API direct.
// Stores credentials via the existing manage-integration-secret edge function
// (admin-only RLS) — no schema changes needed.
//
// Steps:
//   1. Meta account & app
//   2. Phone number (test or production)
//   3. Permanent access token
//   4. Webhook (URL + verify token)
//   5. Test send + templates briefing

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import {
  useSecretStatuses,
  useSetSecret,
} from "@/hooks/useIntegrationSecrets";
import { usePolicySettings, useUpdatePolicySetting } from "@/hooks/usePolicySettings";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const STEPS = [
  { key: "account", label: "Meta account" },
  { key: "phone", label: "Phone number" },
  { key: "token", label: "Permanent token" },
  { key: "webhook", label: "Webhook" },
  { key: "test", label: "Test & go live" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

function generateVerifyToken(): string {
  // Random URL-safe verify token; admin pastes this into Meta to match.
  const arr = new Uint8Array(18);
  crypto.getRandomValues(arr);
  return "kru-" + Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export function WhatsAppMetaSetupWizard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: secretStatuses } = useSecretStatuses();
  const { data: settings } = usePolicySettings();
  const setSecret = useSetSecret();
  const updateSetting = useUpdatePolicySetting();

  const [stepIdx, setStepIdx] = useState(0);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [acks, setAcks] = useState<Record<StepKey, boolean>>({
    account: false,
    phone: false,
    token: false,
    webhook: false,
    test: false,
  });
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");

  const isConfigured = (key: string) => secretStatuses?.[key]?.configured ?? false;
  const getSetting = (key: string) => settings?.find((s) => s.key === key);
  const getSettingValue = (key: string) => {
    const s = getSetting(key);
    if (!s) return "";
    return String(s.value).replace(/^"|"$/g, "");
  };

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-meta-webhook`;
  const step = STEPS[stepIdx];
  const progressPct = ((stepIdx + 1) / STEPS.length) * 100;

  // Derived "step satisfied" — controls whether Next is enabled.
  const stepSatisfied = useMemo<Record<StepKey, boolean>>(() => ({
    account: acks.account,
    phone:
      isConfigured("whatsapp_meta_phone_number_id") &&
      isConfigured("whatsapp_meta_business_account_id"),
    token: isConfigured("whatsapp_meta_access_token"),
    webhook: isConfigured("whatsapp_meta_webhook_verify_token") && acks.webhook,
    test: acks.test,
  }), [secretStatuses, acks]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied" });
  };

  const handleSaveSecret = async (key: string) => {
    const value = (editing[key] ?? "").trim();
    if (value.length < 3) return;
    try {
      await setSecret.mutateAsync({ key, value });
      toast({ title: "Saved securely", description: key });
      setEditing((p) => { const n = { ...p }; delete n[key]; return n; });
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    }
  };

  const handleSavePublicNumber = async () => {
    const raw = (editing["whatsapp_public_number"] ?? "").trim();
    if (raw.length < 6) return;
    const setting = getSetting("whatsapp_public_number");
    try {
      if (setting) {
        await updateSetting.mutateAsync({ id: setting.id, value: raw });
      } else {
        const { error } = await supabase
          .from("policy_settings")
          .insert({ key: "whatsapp_public_number", value: raw });
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["policy_settings"] });
      }
      await qc.invalidateQueries({ queryKey: ["bot-identity"] });
      toast({ title: "Saved", description: "Public WhatsApp number stored." });
      setEditing((p) => { const n = { ...p }; delete n["whatsapp_public_number"]; return n; });
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    }
  };

  const handleAutofillVerifyToken = () => {
    const token = generateVerifyToken();
    setEditing((p) => ({ ...p, whatsapp_meta_webhook_verify_token: token }));
    setShowSecret((p) => ({ ...p, whatsapp_meta_webhook_verify_token: true }));
  };

  const handleSendTest = async () => {
    const to = testTo.trim().replace(/^\+/, "");
    if (to.length < 6) {
      toast({ title: "Enter a recipient number", description: "E.164 format, e.g. 14155551212", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      // Reuse the existing admin messaging test path through messaging-router
      // is overkill — call notify-via-messaging with a synthetic event instead.
      // Simplest: fetch Meta directly from the client is impossible (no token here),
      // so use the admin-messaging-test edge function which already exists for this.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-messaging-test`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ channel: "whatsapp", chat_id: to, text: "👋 Test from LMT CampStay — your Meta WhatsApp bridge is live." }),
        },
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Test failed (${resp.status})`);
      }
      toast({ title: "Sent", description: "Check the recipient's WhatsApp." });
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const SecretField = ({ keyName, label, placeholder }: { keyName: string; label: string; placeholder: string }) => {
    const configured = isConfigured(keyName);
    const visible = showSecret[keyName];
    const dirty = (editing[keyName] ?? "").length > 0;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{label}</Label>
          {configured ? (
            <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950">
              <CheckCircle2 className="h-3 w-3" /> Saved
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
              <Circle className="h-3 w-3" /> Not set
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              type={visible ? "text" : "password"}
              value={editing[keyName] ?? ""}
              onChange={(e) => setEditing((p) => ({ ...p, [keyName]: e.target.value }))}
              placeholder={configured ? "••••••••••••" : placeholder}
              className="pr-10 font-mono text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setShowSecret((p) => ({ ...p, [keyName]: !p[keyName] }))}
            >
              {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {dirty && (
            <Button size="sm" onClick={() => handleSaveSecret(keyName)} disabled={setSecret.isPending}>
              Save
            </Button>
          )}
        </div>
      </div>
    );
  };

  const AckCheckbox = ({ stepKey, label }: { stepKey: StepKey; label: string }) => (
    <label className="flex items-start gap-2 text-xs cursor-pointer select-none">
      <input
        type="checkbox"
        checked={acks[stepKey]}
        onChange={(e) => setAcks((p) => ({ ...p, [stepKey]: e.target.checked }))}
        className="mt-0.5 h-4 w-4 rounded border-input"
      />
      <span className="text-muted-foreground leading-snug">{label}</span>
    </label>
  );

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base flex items-center gap-2">
              WhatsApp (Meta Cloud API)
              <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
                <Sparkles className="h-3 w-3" /> Direct
              </Badge>
            </CardTitle>
            <CardDescription>Guided setup — connect WhatsApp directly through Meta. No middleman, lower per-message cost.</CardDescription>
          </div>
        </div>
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">Step {stepIdx + 1} of {STEPS.length} — {step.label}</span>
            <span className="text-muted-foreground">{Math.round(progressPct)}%</span>
          </div>
          <Progress value={progressPct} className="h-1.5" />
          <div className="flex items-center gap-1 pt-1 overflow-x-auto">
            {STEPS.map((s, i) => {
              const done = stepSatisfied[s.key];
              const active = i === stepIdx;
              return (
                <button
                  key={s.key}
                  onClick={() => setStepIdx(i)}
                  className={`text-[10px] px-2 py-1 rounded-full whitespace-nowrap transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : done
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {done && !active && <CheckCircle2 className="h-2.5 w-2.5 inline mr-1" />}
                  {i + 1}. {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ─── STEP 1: Meta account & app ─── */}
        {step.key === "account" && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-semibold">Before you start, you need:</p>
              <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-5">
                <li>A Facebook account (personal — used to log in to Meta for Developers)</li>
                <li>A Meta Business account (free; create one if you don't have it)</li>
                <li>About 30 minutes for first-time setup</li>
              </ul>
            </div>

            <ol className="space-y-3 text-xs text-muted-foreground">
              <li className="flex gap-3">
                <span className="font-bold text-primary">1.</span>
                <div className="flex-1">
                  Open{" "}
                  <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                    developers.facebook.com <ExternalLink className="h-3 w-3" />
                  </a>{" "}
                  and sign in with your Facebook account. Click <em>Get Started</em> in the top right and accept the developer terms.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-primary">2.</span>
                <div className="flex-1">
                  From{" "}
                  <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                    My Apps <ExternalLink className="h-3 w-3" />
                  </a>{" "}
                  click <em>Create App</em>. Choose the <strong>Business</strong> app type — this is the only type that supports WhatsApp. Name it something you'll recognize (e.g. "LMT CampStay Messaging").
                </div>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-primary">3.</span>
                <div className="flex-1">
                  On your app dashboard, scroll to <em>Add products to your app</em> and click <strong>Set up</strong> on the WhatsApp tile. Meta will create or link a WhatsApp Business Account (WABA) for you.
                </div>
              </li>
            </ol>

            <Separator />
            <AckCheckbox stepKey="account" label="I've created a Meta Business app and added the WhatsApp product." />
          </div>
        )}

        {/* ─── STEP 2: Phone number ─── */}
        {step.key === "phone" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              On the <em>WhatsApp → API Setup</em> page in your Meta app, you'll choose a phone number. Two options:
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-sm font-semibold">Meta test number (free)</p>
                <p className="text-[11px] text-muted-foreground">
                  Already provisioned. Instant setup. Can only message up to 5 pre-verified recipients.
                </p>
                <Badge variant="outline" className="text-[10px]">Good for testing</Badge>
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-sm font-semibold">Your business number</p>
                <p className="text-[11px] text-muted-foreground">
                  Required for production. Add under <em>Phone numbers → Add phone number</em>, verify via SMS or voice call.
                </p>
                <Badge className="text-[10px]">Production-ready</Badge>
              </div>
            </div>

            <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 [&>svg]:text-amber-600 py-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              <AlertDescription className="text-[11px] text-amber-900 dark:text-amber-200">
                Test numbers can't message random users — only whitelisted recipients. Don't ship to production with one.
              </AlertDescription>
            </Alert>

            <Separator />

            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Paste your IDs (from API Setup page)</p>
            <SecretField
              keyName="whatsapp_meta_phone_number_id"
              label="Phone Number ID"
              placeholder="under the From dropdown — long numeric ID"
            />
            <SecretField
              keyName="whatsapp_meta_business_account_id"
              label="WhatsApp Business Account ID"
              placeholder="labeled on the same page"
            />

            <Separator />

            <div className="space-y-2">
              <Label className="text-sm font-medium">Public WhatsApp number (for guest deep-links)</Label>
              <p className="text-[11px] text-muted-foreground">
                The E.164 number guests will see when tapping "Connect WhatsApp" on their portal. Same as the number above, in <code>+countrycode</code> format.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  value={editing["whatsapp_public_number"] ?? getSettingValue("whatsapp_public_number")}
                  onChange={(e) => setEditing((p) => ({ ...p, whatsapp_public_number: e.target.value }))}
                  placeholder="+14155551212"
                  className="font-mono text-xs"
                />
                {(editing["whatsapp_public_number"] ?? "") !== "" && (
                  <Button size="sm" onClick={handleSavePublicNumber} disabled={updateSetting.isPending}>
                    Save
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 3: Permanent token ─── */}
        {step.key === "token" && (
          <div className="space-y-4">
            <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-sm">Don't use the temporary token</AlertTitle>
              <AlertDescription className="text-xs">
                The token shown on the API Setup page expires in <strong>24 hours</strong>. Generate a permanent one — this is the part most people get wrong.
              </AlertDescription>
            </Alert>

            <ol className="space-y-3 text-xs text-muted-foreground">
              <li className="flex gap-3">
                <span className="font-bold text-primary">1.</span>
                <div className="flex-1">
                  Open{" "}
                  <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                    Business Settings → Users → System Users <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-primary">2.</span>
                <div className="flex-1">
                  Click <em>Add</em> to create a new system user. Give it a name (e.g. "LMT CampStay Messaging") and set role to <strong>Admin</strong>.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-primary">3.</span>
                <div className="flex-1">
                  Click the new system user, then <em>Add Assets</em> → <em>Apps</em> → select your WhatsApp app → check <em>Full control / Manage app</em>.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-primary">4.</span>
                <div className="flex-1">
                  Click <em>Generate New Token</em>. Select your app, then check both <code>whatsapp_business_messaging</code> and <code>whatsapp_business_management</code> scopes. Set expiration to <strong>Never</strong>. Copy the token immediately — you won't see it again.
                </div>
              </li>
            </ol>

            <Separator />
            <SecretField
              keyName="whatsapp_meta_access_token"
              label="Permanent Access Token"
              placeholder="EAAG… (long string)"
            />
          </div>
        )}

        {/* ─── STEP 4: Webhook ─── */}
        {step.key === "webhook" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              In your Meta app, go to <em>WhatsApp → Configuration → Webhook</em> and click <strong>Edit</strong>.
            </p>

            <div className="rounded-md border bg-muted/30 p-3 space-y-3">
              <div>
                <Label className="text-xs font-medium">Callback URL — paste this into Meta:</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="block flex-1 bg-background border rounded px-2 py-1.5 text-[11px] break-all">
                    {webhookUrl}
                  </code>
                  <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => copy(webhookUrl)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Verify Token — generate, save here, paste into Meta:</Label>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={handleAutofillVerifyToken}>
                    <Sparkles className="h-3 w-3 mr-1" /> Generate
                  </Button>
                </div>
                <div className="mt-1">
                  <SecretField
                    keyName="whatsapp_meta_webhook_verify_token"
                    label=""
                    placeholder="any random string — or click Generate"
                  />
                </div>
                {editing["whatsapp_meta_webhook_verify_token"] && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 text-[11px]"
                    onClick={() => copy(editing["whatsapp_meta_webhook_verify_token"])}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy verify token
                  </Button>
                )}
              </div>
            </div>

            <ol className="space-y-2 text-xs text-muted-foreground list-decimal pl-5">
              <li>Save the verify token above (Save button next to the field).</li>
              <li>Paste the Callback URL and the same Verify Token into Meta's webhook editor.</li>
              <li>Click <em>Verify and save</em> in Meta — you'll see a green checkmark when it succeeds.</li>
              <li>Under <em>Webhook fields</em>, click <strong>Manage</strong> and toggle on <code>messages</code>. That's the only required field.</li>
            </ol>

            <Separator />
            <AckCheckbox stepKey="webhook" label="Meta confirmed the webhook verified successfully and the messages field is subscribed." />
          </div>
        )}

        {/* ─── STEP 5: Test & templates ─── */}
        {step.key === "test" && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 space-y-3">
              <Label className="text-sm font-medium">Send a test message</Label>
              <p className="text-[11px] text-muted-foreground">
                Recipient must be whitelisted in your Meta app (or any number if you're using a verified production number).
              </p>
              <div className="flex items-center gap-2">
                <Input
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="+14155551212"
                  className="font-mono text-xs"
                />
                <Button size="sm" onClick={handleSendTest} disabled={testing}>
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Send test"}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-sm font-semibold">Templates vs. replies — read this</p>
              <p className="text-xs text-muted-foreground">
                WhatsApp splits outbound messaging into two buckets:
              </p>
              <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-5">
                <li>
                  <strong>Reply messages</strong> — responses to someone who messaged you in the last 24 hours. Work immediately, no template, no approval.
                </li>
                <li>
                  <strong>Template messages</strong> — proactive outbound (booking confirmations, arrival reminders). Must be submitted to Meta for approval.
                </li>
              </ul>
              <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 [&>svg]:text-amber-600 py-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                <AlertTitle className="text-xs">Template approval takes time</AlertTitle>
                <AlertDescription className="text-[11px] text-amber-900 dark:text-amber-200">
                  Plan for <strong>a few hours to two business days</strong>. Submit templates from{" "}
                  <a href="https://business.facebook.com/wa/manage/message-templates" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-1">
                    WhatsApp Manager → Message Templates <ExternalLink className="h-3 w-3" />
                  </a>{" "}
                  early, before you need them.
                </AlertDescription>
              </Alert>
            </div>

            <AckCheckbox stepKey="test" label="Test message landed (or recipient is whitelisted) — I'm done with setup." />
          </div>
        )}

        {/* ─── Navigation ─── */}
        <Separator />
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            disabled={stepIdx === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {stepIdx < STEPS.length - 1 ? (
            <Button
              size="sm"
              onClick={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}
              disabled={!stepSatisfied[step.key]}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Badge variant="outline" className="text-[11px] gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950">
              <CheckCircle2 className="h-3 w-3" />
              {Object.values(stepSatisfied).every(Boolean) ? "All set — bridge live" : "Complete the steps above"}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
