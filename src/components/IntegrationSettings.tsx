import { useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, Mail, Eye, EyeOff, Save, CheckCircle2, XCircle, ExternalLink } from "lucide-react";

const SECRET_KEYS = ["stripe_secret_key", "stripe_publishable_key", "stripe_webhook_secret", "resend_api_key"];

export function IntegrationSettings() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = usePolicySettings();
  const updateSetting = useUpdatePolicySetting();
  const { toast } = useToast();
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  if (isLoading) return <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  const getSetting = (key: string) => settings?.find((s) => s.key === key);
  const getValue = (key: string) => {
    const s = getSetting(key);
    if (!s) return "";
    const v = String(s.value).replace(/^"|"$/g, "");
    return v;
  };
  const isConfigured = (key: string) => {
    const v = getValue(key);
    return v.length > 3;
  };
  const getEditValue = (key: string) => editValues[key] ?? getValue(key);
  const isDirty = (key: string) => editValues[key] !== undefined && editValues[key] !== getValue(key);

  const handleSave = async (key: string) => {
    const setting = getSetting(key);
    if (!setting || !isDirty(key)) return;
    try {
      await updateSetting.mutateAsync({ id: setting.id, value: editValues[key] });
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

  const maskValue = (val: string) => {
    if (val.length <= 8) return "••••••••";
    return val.slice(0, 4) + "••••••••" + val.slice(-4);
  };

  const renderSecretField = (key: string, label: string, placeholder: string) => {
    const current = getEditValue(key);
    const configured = isConfigured(key);
    const visible = showSecrets[key];

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{label}</Label>
          {configured ? (
            <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950">
              <CheckCircle2 className="h-3 w-3" /> Configured
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
              value={isDirty(key) ? current : (configured && !visible ? maskValue(current) : current)}
              onChange={(e) => setEditValues((prev) => ({ ...prev, [key]: e.target.value }))}
              onFocus={() => {
                if (!isDirty(key)) setEditValues((prev) => ({ ...prev, [key]: getValue(key) }));
              }}
              placeholder={placeholder}
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
            <Button size="icon" variant="outline" onClick={() => handleSave(key)} disabled={updateSetting.isPending}>
              <Save className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  const stripeEnabled = getValue("stripe_enabled") === "true";
  const depositsOnlineEnabled = getValue("deposits_online_enabled") === "true";

  return (
    <div className="space-y-6">
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
                value={getEditValue("resend_from_email")}
                onChange={(e) => setEditValues((prev) => ({ ...prev, resend_from_email: e.target.value }))}
                placeholder="noreply@yourdomain.com"
                className="flex-1 text-sm"
              />
              {isDirty("resend_from_email") && (
                <Button size="icon" variant="outline" onClick={() => handleSave("resend_from_email")} disabled={updateSetting.isPending}>
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
    </div>
  );
}
