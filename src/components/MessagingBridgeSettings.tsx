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
import { CheckCircle2, XCircle, Eye, EyeOff, Save, Trash2, MessageCircle, Copy, Send, Loader2, ChevronRight } from "lucide-react";
import { NotificationPreferencesPanel } from "@/components/NotificationPreferencesPanel";
import { MessagingDeliveryDashboard } from "@/components/MessagingDeliveryDashboard";
import { LinkedChatsList } from "@/components/LinkedChatsList";
import { MessagingAdminTools } from "@/components/MessagingAdminTools";
import { TelegramWebhookControl } from "@/components/TelegramWebhookControl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useBotIdentity, buildConnectUrl } from "@/hooks/useBotIdentity";
import { useQueryClient } from "@tanstack/react-query";

const TELEGRAM_KEYS = ["telegram_bot_token"] as const;
const TWILIO_KEYS = ["twilio_account_sid", "twilio_auth_token", "twilio_sms_from", "twilio_whatsapp_from"] as const;

export function MessagingBridgeSettings() {
  const { role } = useAuth();
  const canManage = role === "admin" || role === "manager";
  const { data: settings } = usePolicySettings();
  const { data: secretStatuses } = useSecretStatuses();
  const setSecret = useSetSecret();
  const deleteSecret = useDeleteSecret();
  const updateSetting = useUpdatePolicySetting();
  const { toast } = useToast();

  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [connectBusy, setConnectBusy] = useState<"telegram" | "whatsapp" | null>(null);
  const { data: botIdentity, isLoading: identityLoading, refetch: refetchIdentity } = useBotIdentity();

  const getSetting = (key: string) => settings?.find((s) => s.key === key);
  const getValue = (key: string) => {
    const s = getSetting(key);
    if (!s) return "";
    return String(s.value).replace(/^"|"$/g, "");
  };
  const isSecretConfigured = (key: string) => secretStatuses?.[key]?.configured ?? false;

  const telegramEnabled = getValue("telegram_bridge_enabled") === "true";
  const twilioEnabled = getValue("twilio_bridge_enabled") === "true";

  const webhookBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

  const handleToggle = async (key: string, checked: boolean) => {
    const setting = getSetting(key);
    if (setting) {
      await updateSetting.mutateAsync({ id: setting.id, value: String(checked) });
    } else {
      // policy_settings row doesn't exist yet — create via direct insert
      await supabase.from("policy_settings").insert({ key, value: String(checked) });
    }
    toast({ title: "Saved", description: `${key} updated.` });
  };

  const handleSaveSecret = async (key: string) => {
    const value = editValues[key];
    if (!value || value.length < 3) return;
    try {
      await setSecret.mutateAsync({ key, value });
      toast({ title: "Saved securely", description: `${key} stored.` });
      setEditValues((prev) => { const next = { ...prev }; delete next[key]; return next; });
      // Bot identity (Telegram username, WhatsApp number) depends on these secrets — refresh.
      if (key === "telegram_bot_token" || key === "twilio_whatsapp_from") refetchIdentity();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteSecret = async (key: string) => {
    try {
      await deleteSecret.mutateAsync(key);
      toast({ title: "Removed", description: `${key} cleared.` });
      if (key === "telegram_bot_token" || key === "twilio_whatsapp_from") refetchIdentity();
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
        <div className="flex flex-wrap gap-2">
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
        </div>
        {botIdentity && !botIdentity.telegram.username && !botIdentity.whatsapp.number && (
          <p className="text-xs text-muted-foreground">
            No channels are configured yet. Save a Telegram bot token or Twilio WhatsApp credentials above first.
          </p>
        )}
        {botIdentity?.telegram.error && (
          <p className="text-xs text-destructive">
            Telegram: {botIdentity.telegram.error}
          </p>
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
            {renderSecretField("telegram_bot_token", "Bot Token", "1234567890:ABCdef…")}
            <p className="text-[11px] text-muted-foreground">
              Bot username is auto-resolved from the token via Telegram's <code>getMe</code> — no manual entry needed.
            </p>

            <Separator />

            {/* Step 3: Webhook activation */}
            <TelegramWebhookControl />
          </CardContent>
        )}
      </Card>

      {/* Twilio (WhatsApp + SMS) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">WhatsApp & SMS Bridge (Twilio)</CardTitle>
                <CardDescription>Inbound WhatsApp / SMS routed through Kru Glitch (capture-only)</CardDescription>
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
            {renderSecretField("twilio_account_sid", "Account SID", "AC…")}
            {renderSecretField("twilio_auth_token", "Auth Token", "your auth token")}
            {renderSecretField("twilio_sms_from", "SMS From Number", "+15551234567")}
            {renderSecretField("twilio_whatsapp_from", "WhatsApp From Number", "+14155238886 (sandbox)")}
            <p className="text-[11px] text-muted-foreground">
              Public WhatsApp number for guest deep-links is auto-derived from the &ldquo;WhatsApp From&rdquo; secret above.
            </p>

            <Separator />
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Webhook URLs (paste into Twilio)</p>
              <div className="space-y-1.5">
                <p>SMS — Console → Phone Numbers → your number → <em>A MESSAGE COMES IN</em>:</p>
                <div className="flex items-center gap-2">
                  <code className="block flex-1 bg-background rounded px-2 py-1 text-[11px] break-all">
                    {webhookBase}/twilio-webhook?channel=sms
                  </code>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(`${webhookBase}/twilio-webhook?channel=sms`)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p>WhatsApp — Console → Messaging → Sandbox/Sender → <em>WHEN A MESSAGE COMES IN</em>:</p>
                <div className="flex items-center gap-2">
                  <code className="block flex-1 bg-background rounded px-2 py-1 text-[11px] break-all">
                    {webhookBase}/twilio-webhook?channel=whatsapp
                  </code>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(`${webhookBase}/twilio-webhook?channel=whatsapp`)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <p className="pt-2"><strong>Method:</strong> POST. The webhook verifies Twilio's signature on every call.</p>
              <p><strong>Heads up:</strong> turn on Twilio's <em>SMS Pumping Protection</em> and review <em>SMS Geo Permissions</em> before going live to prevent fraud.</p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Internal token */}
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
