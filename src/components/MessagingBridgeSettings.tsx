import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useSecretStatuses, useSetSecret, useDeleteSecret } from "@/hooks/useIntegrationSecrets";
import { usePolicySettings, useUpdatePolicySetting } from "@/hooks/usePolicySettings";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CheckCircle2, XCircle, Eye, EyeOff, Save, Trash2, MessageCircle, Copy, Send, Loader2, ChevronRight, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { NotificationPreferencesPanel } from "@/components/NotificationPreferencesPanel";
import { MessagingDeliveryDashboard } from "@/components/MessagingDeliveryDashboard";
import { LinkedChatsList } from "@/components/LinkedChatsList";
import { MessagingAdminTools } from "@/components/MessagingAdminTools";
import { TelegramWebhookControl } from "@/components/TelegramWebhookControl";
import { LineWebhookControl } from "@/components/LineWebhookControl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useBotIdentity, buildConnectUrl } from "@/hooks/useBotIdentity";
import { useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { WhatsAppMetaSetupWizard } from "@/components/WhatsAppMetaSetupWizard";

const TELEGRAM_KEYS = ["telegram_bot_token"] as const;
const TWILIO_KEYS = ["twilio_account_sid", "twilio_auth_token", "twilio_sms_from"] as const;

export function MessagingBridgeSettings() {
  const { role } = useAuth();
  // Admin-only for ALL bridge configuration (credentials, webhooks, toggles, dashboards, ping).
  // Every other role — including manager, front_desk, maintenance, guest — only sees the
  // personal "Connect your chat" card below. No platform config UI leaks to non-admins.
  const canManage = role === "admin";
  const { data: settings } = usePolicySettings();
  const { data: secretStatuses } = useSecretStatuses();
  const setSecret = useSetSecret();
  const deleteSecret = useDeleteSecret();
  const updateSetting = useUpdatePolicySetting();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [connectBusy, setConnectBusy] = useState<"telegram" | "whatsapp" | null>(null);
  const [lineOaIdDraft, setLineOaIdDraft] = useState<string | null>(null);
  const { data: botIdentity, isLoading: identityLoading, isFetching: identityFetching, refetch: refetchIdentity } = useBotIdentity();

  const getSetting = (key: string) => settings?.find((s) => s.key === key);
  const getValue = (key: string) => {
    const s = getSetting(key);
    if (!s) return "";
    return String(s.value).replace(/^"|"$/g, "");
  };
  const isSecretConfigured = (key: string) => secretStatuses?.[key]?.configured ?? false;

  const telegramEnabled = getValue("telegram_bridge_enabled") === "true";
  const twilioEnabled = getValue("twilio_bridge_enabled") === "true";
  const lineEnabled = getValue("line_bridge_enabled") === "true";

  const webhookBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

  const handleToggle = async (key: string, checked: boolean) => {
    const setting = getSetting(key);
    try {
      if (setting) {
        await updateSetting.mutateAsync({ id: setting.id, value: String(checked) });
      } else {
        const { error } = await supabase.from("policy_settings").insert({ key, value: String(checked) });
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["policy_settings"] });
      }
      toast({ title: "Saved", description: `${key} ${checked ? "enabled" : "disabled"}.` });
    } catch (err: any) {
      toast({ title: "Couldn't save toggle", description: err.message, variant: "destructive" });
    }
  };

  const handleSaveSecret = async (key: string) => {
    const value = editValues[key];
    if (!value || value.length < 3) return;
    try {
      await setSecret.mutateAsync({ key, value });
      toast({ title: "Saved securely", description: `${key} stored.` });
      setEditValues((prev) => { const next = { ...prev }; delete next[key]; return next; });
      // Bot identity (Telegram username) depends on these secrets — refresh.
      if (key === "telegram_bot_token") {
        await qc.invalidateQueries({ queryKey: ["bot-identity"] });
        await refetchIdentity();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteSecret = async (key: string) => {
    try {
      await deleteSecret.mutateAsync(key);
      toast({ title: "Removed", description: `${key} cleared.` });
      if (key === "telegram_bot_token") {
        await qc.invalidateQueries({ queryKey: ["bot-identity"] });
        await refetchIdentity();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleConnect = async (channel: "telegram" | "whatsapp") => {
    if (!botIdentity) return;
    setConnectBusy(channel);
    try {
      const url = await buildConnectUrl(channel, botIdentity);
      window.open(url, "_blank", "noopener,noreferrer");
      toast({
        title: "Opening " + (channel === "telegram" ? "Telegram" : "WhatsApp"),
        description: "Tap Start in the chat to finish connecting.",
      });
    } catch (err: any) {
      toast({ title: "Couldn't open chat", description: err.message, variant: "destructive" });
    } finally {
      setConnectBusy(null);
    }
  };

  const renderSecretField = (key: string, label: string, placeholder: string) => {
    const configured = isSecretConfigured(key);
    const visible = showSecrets[key];
    const dirty = (editValues[key] ?? "").length > 0;

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
              value={editValues[key] ?? ""}
              onChange={(e) => setEditValues((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder={configured ? "••••••••••••" : placeholder}
              className="pr-10 font-mono text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setShowSecrets((p) => ({ ...p, [key]: !p[key] }))}
            >
              {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {dirty && (
            <Button size="icon" variant="outline" onClick={() => handleSaveSecret(key)} disabled={setSecret.isPending}>
              <Save className="h-4 w-4" />
            </Button>
          )}
          {configured && !dirty && (
            <Button size="icon" variant="outline" className="text-destructive" onClick={() => handleDeleteSecret(key)} disabled={deleteSecret.isPending}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied" });
  };

  const linkChatCard = (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Send className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Link your chat</CardTitle>
            <CardDescription>One tap connects your account — no codes to copy.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Button
            onClick={() => handleConnect("telegram")}
            disabled={!botIdentity?.telegram.username || connectBusy !== null || identityLoading}
            size="sm"
          >
            {connectBusy === "telegram"
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Send className="h-4 w-4 mr-2" />}
            Connect Telegram
          </Button>
          <Button
            onClick={() => handleConnect("whatsapp")}
            disabled={!botIdentity?.whatsapp.number || connectBusy !== null || identityLoading}
            size="sm"
            variant="outline"
          >
            {connectBusy === "whatsapp"
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <MessageCircle className="h-4 w-4 mr-2" />}
            Connect WhatsApp
          </Button>
          <Button
            onClick={() => refetchIdentity()}
            disabled={identityFetching}
            size="sm"
            variant="ghost"
          >
            {identityFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>
        {botIdentity?.telegram.username && (
          <p className="text-[11px] text-muted-foreground">
            Telegram bot: <span className="font-mono">@{botIdentity.telegram.username}</span>
          </p>
        )}
        {botIdentity && !botIdentity.telegram.username && !botIdentity.whatsapp.number && !botIdentity.telegram.error && (
          <p className="text-xs text-muted-foreground">
            No channels are configured yet. Save a Telegram bot token, or complete the WhatsApp Meta setup wizard above.
          </p>
        )}
        {botIdentity?.telegram.configured && !botIdentity.telegram.username && !botIdentity.telegram.error && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Telegram bot token is saved but the username hasn't resolved yet. Click Refresh, or check the token is valid.
          </p>
        )}
        {botIdentity?.telegram.error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            <span className="font-medium">Telegram error:</span> {botIdentity.telegram.error}
            <p className="mt-1 text-[11px] opacity-80">
              Double-check the bot token from BotFather. The token must look like <code>1234567890:ABC…</code>.
            </p>
          </div>
        )}
        <Separator />
        <NotificationPreferencesPanel />
      </CardContent>
    </Card>
  );

  // Non-admins only see the link-your-chat card + notification prefs.
  if (!canManage) {
    return <div className="space-y-6">{linkChatCard}</div>;
  }

  return (
    <div className="space-y-6">
      {/* 1. ADMIN CREDENTIALS FIRST — Telegram bot token + webhook activation */}

      {/* Telegram */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Telegram Bridge</CardTitle>
                <CardDescription>Inbound messages routed through Kru Glitch (capture-only)</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="tg-toggle" className="text-sm text-muted-foreground">Enabled</Label>
              <Switch
                id="tg-toggle"
                checked={telegramEnabled}
                onCheckedChange={(checked) => handleToggle("telegram_bridge_enabled", checked)}
              />
            </div>
          </div>
        </CardHeader>
        {telegramEnabled && (
          <CardContent className="space-y-4">
            {/* Step 1: BotFather setup guide */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground group">
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-90" />
                  How to create your Telegram bot
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-2">
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Open Telegram and search for <strong>@BotFather</strong>.</li>
                    <li>Send <code>/newbot</code> and follow the prompts to name your bot.</li>
                    <li>BotFather will give you a <strong>Bot Token</strong> — copy it.</li>
                    <li>Paste the token below and click Save.</li>
                    <li>Then click <strong>Activate Webhook</strong> to go live.</li>
                  </ol>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Step 2: Token input */}
            {renderSecretField("telegram_bot_token", "Telegram Bot Token", "1234567890:ABCdef…")}
            <p className="text-[11px] text-muted-foreground">
              Bot username is auto-resolved from the token via Telegram's <code>getMe</code> — no manual entry needed.
            </p>

            <Separator />

            {/* Step 3: Webhook activation */}
            <TelegramWebhookControl />
          </CardContent>
        )}
      </Card>

      {/* WhatsApp via Meta Cloud API (direct, guided wizard) */}
      <WhatsAppMetaSetupWizard />

      {/* SMS via Twilio (WhatsApp now goes Meta-direct above) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">SMS + WhatsApp Bridge (Twilio)</CardTitle>
                <CardDescription>Inbound SMS and WhatsApp routed through Kru Glitch (capture-only). Use this instead of the Meta wizard if you don't have Meta access.</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="tw-toggle" className="text-sm text-muted-foreground">Enabled</Label>
              <Switch
                id="tw-toggle"
                checked={twilioEnabled}
                onCheckedChange={(checked) => handleToggle("twilio_bridge_enabled", checked)}
              />
            </div>
          </div>
        </CardHeader>
        {twilioEnabled && (
          <CardContent className="space-y-4">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground group">
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-90" />
                  How to get your Twilio SMS credentials
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-2">
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Sign in to the <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Twilio Console</a>.</li>
                    <li>From the dashboard, copy your <strong>Account SID</strong> and <strong>Auth Token</strong>.</li>
                    <li>Buy or assign an SMS-capable number under <em>Phone Numbers → Active Numbers</em>.</li>
                    <li>Paste all three below and Save.</li>
                  </ol>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {renderSecretField("twilio_account_sid", "Account SID", "AC…")}
            {renderSecretField("twilio_auth_token", "Auth Token", "your auth token")}
            {renderSecretField("twilio_sms_from", "SMS From Number", "+15551234567")}
            {renderSecretField("twilio_whatsapp_from", "WhatsApp From Number", "+14155238886 (sandbox) or your approved sender")}

            <Separator />
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Webhook URLs (paste into Twilio)</p>
              <p>SMS — Phone Numbers → your number → <em>A MESSAGE COMES IN</em>:</p>
              <div className="flex items-center gap-2">
                <code className="block flex-1 bg-background rounded px-2 py-1 text-[11px] break-all">
                  {webhookBase}/twilio-webhook?channel=sms
                </code>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(`${webhookBase}/twilio-webhook?channel=sms`)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="pt-1">WhatsApp — Messaging → Try it out → WhatsApp sandbox settings (or your WhatsApp sender) → <em>When a message comes in</em>:</p>
              <div className="flex items-center gap-2">
                <code className="block flex-1 bg-background rounded px-2 py-1 text-[11px] break-all">
                  {webhookBase}/twilio-webhook?channel=whatsapp
                </code>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(`${webhookBase}/twilio-webhook?channel=whatsapp`)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="pt-2"><strong>Method:</strong> POST. The webhook verifies Twilio's signature on every call.</p>
              <p><strong>WhatsApp via Twilio:</strong> once the WhatsApp From Number is saved and this bridge is on, outbound WhatsApp goes through Twilio instead of Meta. Sandbox testing: text <code>join &lt;your-code&gt;</code> to +1 415 523 8886 from your phone first.</p>
              <p><strong>Heads up:</strong> turn on Twilio's <em>SMS Pumping Protection</em> and review <em>SMS Geo Permissions</em> before going live.</p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* LINE */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">LINE Bridge</CardTitle>
                <CardDescription>Inbound LINE messages routed through Kru Glitch (capture-only)</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="line-toggle" className="text-sm text-muted-foreground">Enabled</Label>
              <Switch
                id="line-toggle"
                checked={lineEnabled}
                onCheckedChange={(checked) => handleToggle("line_bridge_enabled", checked)}
              />
            </div>
          </div>
        </CardHeader>
        {lineEnabled && (
          <CardContent className="space-y-4">
            <Alert variant="destructive" className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Read this before going live</AlertTitle>
              <AlertDescription className="space-y-1.5 text-xs">
                <p><strong>Push messages have a monthly free quota.</strong> Outbound notifications count against LINE's free tier. Once exceeded, a paid LINE Official Account plan is required.</p>
                <p><strong>Reply messages are always free</strong> — replies to users who messaged you first don't count.</p>
                <p><strong>Users must add your LINE Official Account as a friend</strong> before you can message them.</p>
              </AlertDescription>
            </Alert>

            <Collapsible>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground group">
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-90" />
                  How to get your LINE credentials
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-2">
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Open the <strong>LINE Developers Console</strong> and create a Provider + Messaging API channel.</li>
                    <li>Under <em>Messaging API</em>, issue a long-lived <strong>Channel Access Token</strong>.</li>
                    <li>Under <em>Basic settings</em>, copy the <strong>Channel Secret</strong>.</li>
                    <li>Paste both below and Save.</li>
                    <li>Click <strong>Activate Webhook</strong> — we'll set the endpoint and run LINE's verify ping.</li>
                    <li>In the console, set <em>Use webhook</em> = ON and <em>Auto-reply messages</em> = OFF.</li>
                  </ol>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {renderSecretField("line_channel_access_token", "Channel Access Token", "long-lived token from LINE console")}
            {renderSecretField("line_channel_secret", "Channel Secret", "32-char hex from Basic settings")}

            <Separator />

            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Webhook URL (auto-generated)</p>
              <div className="flex items-center gap-2">
                <code className="block flex-1 bg-background rounded px-2 py-1 text-[11px] break-all">
                  {webhookBase}/line-webhook
                </code>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(`${webhookBase}/line-webhook`)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p>Activate Webhook below sets and verifies this endpoint with LINE in one click.</p>
            </div>

            <Separator />

            {(() => {
              const oaIdSetting = getSetting("line_oa_id");
              const savedOaId = getValue("line_oa_id");
              const draft = lineOaIdDraft ?? savedOaId;
              const cleaned = draft.trim().replace(/^@/, "");
              const friendUrl = cleaned ? `https://line.me/R/ti/p/@${cleaned}` : "";
              const dirty = lineOaIdDraft !== null && lineOaIdDraft.trim() !== savedOaId;

              const saveOaId = async () => {
                const value = (lineOaIdDraft ?? "").trim().replace(/^@/, "");
                try {
                  if (oaIdSetting) {
                    await updateSetting.mutateAsync({ id: oaIdSetting.id, value });
                  } else {
                    const { error } = await supabase.from("policy_settings").insert({ key: "line_oa_id", value });
                    if (error) throw error;
                    await qc.invalidateQueries({ queryKey: ["policy_settings"] });
                  }
                  toast({ title: "Saved", description: "LINE Official Account ID stored." });
                  setLineOaIdDraft(null);
                } catch (err: any) {
                  toast({ title: "Couldn't save", description: err.message, variant: "destructive" });
                }
              };

              return (
                <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Official Account ID</Label>
                    <p className="text-[11px] text-muted-foreground">
                      The LINE OA ID staff search for (e.g. <code>@groundtruth</code>). Found in LINE Official Account Manager → Settings → Basic information.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">@</span>
                    <Input
                      value={cleaned}
                      onChange={(e) => setLineOaIdDraft(e.target.value)}
                      placeholder="groundtruth"
                      className="font-mono text-sm"
                    />
                    {dirty && (
                      <Button size="icon" variant="outline" onClick={saveOaId} disabled={updateSetting.isPending}>
                        <Save className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {savedOaId && !dirty && (
                    <div className="grid grid-cols-[auto,1fr] gap-4 items-start pt-2">
                      <div className="rounded-md bg-background p-2 border">
                        <QRCodeSVG value={friendUrl} size={128} level="M" />
                      </div>
                      <div className="space-y-2 text-xs">
                        <p className="font-medium text-foreground">Staff onboarding — 3 steps</p>
                        <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                          <li>Scan the QR code, or open LINE and search <code className="bg-muted px-1 rounded">@{savedOaId}</code></li>
                          <li>Add the Official Account as a friend</li>
                          <li>Send <code className="bg-muted px-1 rounded">/link CODE</code> (get your code from your profile) to connect your account</li>
                        </ol>
                        <div className="flex items-center gap-2 pt-1">
                          <code className="block flex-1 bg-background rounded border px-2 py-1 text-[11px] break-all">{friendUrl}</code>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(friendUrl)}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          LINE doesn't support deep-link auto-connect like Telegram — staff must friend the OA first before <code>/link</code> works.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <Separator />

            <LineWebhookControl />
          </CardContent>
        )}
      </Card>


      <Card>
        <CardHeader>
          <CardTitle className="text-base">Internal Bridge Token</CardTitle>
          <CardDescription>Shared secret used by the polling/webhook functions to call the AI router. Auto-generate any random string (32+ chars).</CardDescription>
        </CardHeader>
        <CardContent>
          {renderSecretField("messaging_bridge_internal_token", "Internal Token", "any random 32+ char string")}
        </CardContent>
      </Card>

      {/* 2. ADMIN OPERATIONS — simulator, ping, delivery dashboard */}
      <MessagingAdminTools />
      <MessagingDeliveryDashboard />

      {/* 3. STAFF SELF-SERVICE — link your own chat (separated from admin credentials) */}
      <Separator className="my-2" />
      <div className="space-y-2">
        <div className="px-1">
          <h3 className="text-sm font-semibold text-foreground">Staff: link your own chat</h3>
          <p className="text-xs text-muted-foreground">Once the bot is live above, generate a personal code to connect your Telegram / WhatsApp account.</p>
        </div>
        {linkChatCard}
      </div>

      {/* Linked chats — admin view of all guest/staff bindings */}
      <LinkedChatsList />
    </div>
  );
}

/**
 * Inline editor for one field of the messaging_bot_config policy_settings JSON.
 * Used to capture the public bot username + WhatsApp number that the guest
 * onboarding card deep-links into.
 */
function BotConfigField({
  label,
  placeholder,
  field,
  helper,
}: {
  label: string;
  placeholder: string;
  field: "telegram_bot_username" | "whatsapp_number";
  helper?: string;
}) {
  const { data: settings } = usePolicySettings();
  const updateSetting = useUpdatePolicySetting();
  const { toast } = useToast();
  const setting = settings?.find((s) => s.key === "messaging_bot_config");
  const currentConfig = (setting?.value as Record<string, string> | null) ?? {};
  const currentValue = currentConfig[field] ?? "";
  const [draft, setDraft] = useState(currentValue);
  const [saving, setSaving] = useState(false);

  // Keep draft in sync if the underlying setting reloads
  if (currentValue !== draft && !saving && draft === "") {
    // initial hydration only
    setDraft(currentValue);
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const nextValue = { ...currentConfig, [field]: draft.trim() };
      if (setting) {
        await updateSetting.mutateAsync({ id: setting.id, value: nextValue });
      } else {
        await supabase.from("policy_settings").insert({
          key: "messaging_bot_config",
          value: nextValue,
          description: "Public messaging endpoints for guest onboarding deep-links",
        });
      }
      toast({ title: "Saved", description: `${label} updated.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || draft.trim() === currentValue}
        >
          <Save className="h-3.5 w-3.5 mr-1" />
          Save
        </Button>
      </div>
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}
