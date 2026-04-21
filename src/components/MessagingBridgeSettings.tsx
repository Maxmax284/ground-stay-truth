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
import { CheckCircle2, XCircle, Eye, EyeOff, Save, Trash2, MessageCircle, Copy, RefreshCw, Send } from "lucide-react";
import { NotificationPreferencesPanel } from "@/components/NotificationPreferencesPanel";
import { MessagingDeliveryDashboard } from "@/components/MessagingDeliveryDashboard";

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
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

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
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteSecret = async (key: string) => {
    try {
      await deleteSecret.mutateAsync(key);
      toast({ title: "Removed", description: `${key} cleared.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleGenerateCode = async () => {
    setGeneratingCode(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");
      const resp = await fetch(`${webhookBase}/messaging-link`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate code");
      }
      const data = await resp.json();
      setLinkCode(data.code);
      toast({ title: "Code ready", description: `Send "/link ${data.code}" to your bot. Expires in 15 min.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingCode(false);
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

  return (
    <div className="space-y-6">
      {/* Account linking — works regardless of which channels are configured */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Send className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Link your chat</CardTitle>
              <CardDescription>Generate a one-time code, then send it to the bot to connect your account</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Button onClick={handleGenerateCode} disabled={generatingCode} size="sm" variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${generatingCode ? "animate-spin" : ""}`} />
              {linkCode ? "Generate new code" : "Generate code"}
            </Button>
            {linkCode && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted font-mono text-lg tracking-widest">
                {linkCode}
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(`/link ${linkCode}`)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
          {linkCode && (
            <p className="text-xs text-muted-foreground">
              Send <code className="px-1.5 py-0.5 rounded bg-muted">/link {linkCode}</code> to your Telegram / WhatsApp / SMS bot. Code expires in 15 minutes.
            </p>
          )}
          <Separator />
          <NotificationPreferencesPanel />
        </CardContent>
      </Card>

      {canManage && (<>
      {/* Delivery dashboard + global ping */}
      <MessagingDeliveryDashboard />

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
            {renderSecretField("telegram_bot_token", "Bot Token", "1234567890:ABCdef…")}
            <Separator />
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Setup (5 steps)</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Open Telegram, message <strong>@BotFather</strong>, send <code>/newbot</code>, follow the prompts.</li>
                <li>Copy the bot token BotFather gives you and paste it above.</li>
                <li>Toggle this section on (you just did that).</li>
                <li>Open your new bot in Telegram and send <code>/start</code>.</li>
                <li>Generate a link code above and send it as <code>/link 123456</code>.</li>
              </ol>
              <p className="pt-2"><strong>Note:</strong> Inbound messages are picked up roughly every minute by a background poller. No public webhook needed.</p>
            </div>
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
      </>)}
    </div>
  );
}
