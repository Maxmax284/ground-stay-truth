import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePolicySettings, useUpdatePolicySetting, type PolicySetting } from "@/hooks/usePolicySettings";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Save, Banknote, Percent, Heart, Bot, Wrench, Mail, Receipt,
  Clock, Shield, CreditCard, ToggleLeft, CalendarClock, Sparkles, Plane, Wifi, Phone, ScrollText,
} from "lucide-react";

/* ── Setting Groups ────────────────────────────────────────── */

interface SettingGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  keys: string[];
  summary: (get: (key: string) => string) => string;
}

const GROUPS: SettingGroup[] = [
  {
    id: "deposits",
    label: "Deposits & Payments",
    icon: <Banknote className="h-4 w-4" />,
    keys: [
      "deposit_percentage", "deposit_deadline_hours", "deposit_reminder_hours",
      "deposits_online_enabled", "deposits_manual_enabled", "deposits_require_online_when_enabled",
      "payment_provider", "security_deposit_required", "security_deposit_amount",
      "bank_transfer_bank_name", "bank_transfer_account_name", "bank_transfer_account_number", "bank_transfer_notes",
    ],
    summary: (g) => {
      const pct = g("deposit_percentage");
      const provider = g("payment_provider");
      const secDep = g("security_deposit_required") === "true";
      return `${pct}% deposit • ${provider} provider${secDep ? ` • ฿${g("security_deposit_amount")} security deposit` : ""}`;
    },
  },
  {
    id: "discounts",
    label: "Long-Stay Discounts",
    icon: <Percent className="h-4 w-4" />,
    keys: [
      "long_stay_7_nights_discount_percentage",
      "long_stay_14_nights_discount_percentage",
      "long_stay_30_nights_discount_percentage",
    ],
    summary: (g) => `7n: ${g("long_stay_7_nights_discount_percentage")}% • 14n: ${g("long_stay_14_nights_discount_percentage")}% • 30n: ${g("long_stay_30_nights_discount_percentage")}%`,
  },
  {
    id: "loyalty",
    label: "Loyalty Program",
    icon: <Heart className="h-4 w-4" />,
    keys: [
      "loyalty_pricing_enabled", "loyalty_2nd_stay_discount_percentage",
      "loyalty_3rd_stay_discount_percentage", "loyalty_discount_stacks_with_long_stay",
    ],
    summary: (g) => g("loyalty_pricing_enabled") === "true"
      ? `Active • 2nd stay: ${g("loyalty_2nd_stay_discount_percentage")}% • 3rd+: ${g("loyalty_3rd_stay_discount_percentage")}%`
      : "Disabled",
  },
  {
    id: "ai",
    label: "AI Assistant",
    icon: <Bot className="h-4 w-4" />,
    keys: [
      "ai_assistant_enabled", "ai_guest_enabled", "ai_front_desk_enabled",
      "ai_supervisor_enabled", "ai_manager_enabled", "ai_admin_enabled",
    ],
    summary: (g) => g("ai_assistant_enabled") === "true"
      ? `Global: On • ${["guest", "front_desk", "supervisor", "manager", "admin"].filter(r => g(`ai_${r}_enabled`) === "true").length}/5 roles enabled`
      : "Globally disabled",
  },
  {
    id: "operations",
    label: "Operations",
    icon: <Wrench className="h-4 w-4" />,
    keys: [
      "cleaning_buffer_hours", "soft_hold_expiration_hours",
      "require_pre_arrival_completion_before_checkin",
    ],
    summary: (g) => `${g("cleaning_buffer_hours")}h cleaning buffer • ${g("soft_hold_expiration_hours")}h hold expiry`,
  },
  {
    id: "emails",
    label: "Email Notifications",
    icon: <Mail className="h-4 w-4" />,
    keys: ["email_deposit_reminder_enabled", "email_welcome_enabled"],
    summary: (g) => {
      const on = [
        g("email_deposit_reminder_enabled") === "true" && "Deposit reminder",
        g("email_welcome_enabled") === "true" && "Welcome email",
      ].filter(Boolean);
      return on.length ? on.join(" • ") : "All disabled";
    },
  },
  {
    id: "tax",
    label: "Tax & Currency",
    icon: <Receipt className="h-4 w-4" />,
    keys: ["currency_code", "currency_symbol", "tax_included", "tax_rate"],
    summary: (g) => `${g("currency_symbol")} ${g("currency_code")} • ${g("tax_rate")}% tax${g("tax_included") === "true" ? " (inclusive)" : ""}`,
  },
  {
    id: "transport",
    label: "Transport",
    icon: <Plane className="h-4 w-4" />,
    keys: [
      "transport_enabled", "transport_base_fee", "transport_fee_type",
      "transport_night_surcharge_enabled", "transport_night_surcharge",
      "transport_free_pickup_min_nights",
    ],
    summary: (g) => g("transport_enabled") === "true"
      ? `Active • ฿${g("transport_base_fee")} ${g("transport_fee_type")}${g("transport_night_surcharge_enabled") === "true" ? ` • ฿${g("transport_night_surcharge")} night surcharge` : ""}`
      : "Disabled",
  },
  {
    id: "stay_essentials",
    label: "Stay Essentials",
    icon: <Wifi className="h-4 w-4" />,
    keys: [
      "wifi_network_name", "wifi_password",
      "house_rules_summary",
      "emergency_contact_name", "emergency_contact_phone",
    ],
    summary: (g) => {
      const wifi = g("wifi_network_name");
      const emergency = g("emergency_contact_name");
      const parts = [];
      if (wifi) parts.push(`WiFi: ${wifi}`);
      if (emergency) parts.push(`Emergency: ${emergency}`);
      return parts.length ? parts.join(" • ") : "Not configured";
    },
  },
];

/* Keys handled by cancellation editor or technical/sensitive */
const HIDDEN_KEYS = new Set([
  "free_cancellation_days", "partial_refund_days", "partial_refund_percentage",
  "no_refund_hours", "earliest_checkin_time", "checkout_time",
  "stripe_enabled", "stripe_publishable_key", "stripe_secret_key", "stripe_webhook_secret",
  "resend_api_key", "resend_from_email", "camp_info",
]);

const BOOLEAN_KEYS = new Set([
  "ai_assistant_enabled", "ai_guest_enabled", "ai_front_desk_enabled",
  "ai_supervisor_enabled", "ai_manager_enabled", "ai_admin_enabled",
  "deposits_online_enabled", "deposits_manual_enabled", "deposits_require_online_when_enabled",
  "loyalty_pricing_enabled", "loyalty_discount_stacks_with_long_stay",
  "security_deposit_required", "email_deposit_reminder_enabled", "email_welcome_enabled",
  "tax_included", "require_pre_arrival_completion_before_checkin",
  "transport_enabled", "transport_night_surcharge_enabled",
]);

/* Nice display names */
const FRIENDLY_LABELS: Record<string, string> = {
  deposit_percentage: "Deposit Percentage (%)",
  deposit_deadline_hours: "Deposit Deadline (hours)",
  deposit_reminder_hours: "Reminder After (hours)",
  deposits_online_enabled: "Online Deposits",
  deposits_manual_enabled: "Manual Deposits (Cash/Card)",
  deposits_require_online_when_enabled: "Require Online Deposit",
  payment_provider: "Payment Provider",
  security_deposit_required: "Security Deposit Required",
  security_deposit_amount: "Security Deposit Amount (฿)",
  long_stay_7_nights_discount_percentage: "7+ Nights Discount (%)",
  long_stay_14_nights_discount_percentage: "14+ Nights Discount (%)",
  long_stay_30_nights_discount_percentage: "30+ Nights Discount (%)",
  loyalty_pricing_enabled: "Loyalty Pricing",
  loyalty_2nd_stay_discount_percentage: "2nd Stay Discount (%)",
  loyalty_3rd_stay_discount_percentage: "3rd+ Stay Discount (%)",
  loyalty_discount_stacks_with_long_stay: "Stacks with Long-Stay",
  ai_assistant_enabled: "Global AI Toggle",
  ai_guest_enabled: "Guest AI",
  ai_front_desk_enabled: "Front Desk AI",
  ai_supervisor_enabled: "Supervisor AI",
  ai_manager_enabled: "Manager AI",
  ai_admin_enabled: "Admin AI",
  cleaning_buffer_hours: "Cleaning Buffer (hours)",
  soft_hold_expiration_hours: "Soft Hold Expiry (hours)",
  require_pre_arrival_completion_before_checkin: "Require Pre-Arrival Completion",
  email_deposit_reminder_enabled: "Deposit Reminder Email",
  email_welcome_enabled: "Welcome Email on Check-In",
  currency_code: "Currency Code",
  currency_symbol: "Currency Symbol",
  tax_included: "Tax Included in Prices",
  tax_rate: "Tax Rate (%)",
  transport_enabled: "Airport Pickup Service",
  transport_base_fee: "Base Fee (฿)",
  transport_fee_type: "Fee Type (flat / per_person)",
  transport_night_surcharge_enabled: "Night Surcharge",
  transport_night_surcharge: "Night Surcharge Amount (฿)",
  transport_free_pickup_min_nights: "Free Pickup Min Nights (0 = off)",
  bank_transfer_bank_name: "Bank Name",
  bank_transfer_account_name: "Account Name",
  bank_transfer_account_number: "Account Number",
  bank_transfer_notes: "Transfer Instructions (shown to guest)",
};

const SETTING_ICONS: Record<string, React.ReactNode> = {
  deposit_percentage: <Percent className="h-3.5 w-3.5 text-muted-foreground" />,
  deposit_deadline_hours: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  deposit_reminder_hours: <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />,
  security_deposit_amount: <Shield className="h-3.5 w-3.5 text-muted-foreground" />,
  payment_provider: <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />,
};

/* ── Component ─────────────────────────────────────────────── */

export function PolicySettingsForm() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = usePolicySettings();
  const updateSetting = useUpdatePolicySetting();
  const { toast } = useToast();
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  /* Build a lookup by key */
  const byKey = useMemo(() => {
    const map: Record<string, PolicySetting> = {};
    settings?.forEach((s) => { map[s.key] = s; });
    return map;
  }, [settings]);

  const getValue = (key: string) => String(byKey[key]?.value ?? "");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="grid gap-4 sm:grid-cols-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      </div>
    );
  }

  const handleSave = async (setting: PolicySetting) => {
    const rawValue = editValues[setting.id];
    if (rawValue === undefined) return;
    let parsed: any = rawValue;
    const num = Number(rawValue);
    if (!isNaN(num) && rawValue.trim() !== "") parsed = num;
    try {
      await updateSetting.mutateAsync({ id: setting.id, value: parsed });
      toast({ title: "Setting saved", description: `${FRIENDLY_LABELS[setting.key] || setting.key} updated.` });
      setEditValues((prev) => { const next = { ...prev }; delete next[setting.id]; return next; });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleBoolToggle = async (setting: PolicySetting, checked: boolean) => {
    try {
      await updateSetting.mutateAsync({ id: setting.id, value: String(checked) });
      toast({ title: "Setting saved", description: `${FRIENDLY_LABELS[setting.key] || setting.key} updated.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const renderSetting = (key: string) => {
    const s = byKey[key];
    if (!s || HIDDEN_KEYS.has(key)) return null;
    const isBool = BOOLEAN_KEYS.has(key);
    const boolValue = String(s.value) === "true";
    const currentValue = editValues[s.id] ?? String(typeof s.value === "object" ? JSON.stringify(s.value) : s.value);
    const isDirty = editValues[s.id] !== undefined;
    const label = FRIENDLY_LABELS[key] || key;
    const icon = SETTING_ICONS[key];

    return (
      <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-card/50 hover:bg-accent/30 transition-colors">
        {icon && <div className="mt-1 shrink-0">{icon}</div>}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium leading-none">{label}</Label>
          </div>
          {s.description && <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>}
          {isBool ? (
            <div className="flex items-center gap-2 pt-0.5">
              <Switch
                checked={boolValue}
                onCheckedChange={(checked) => handleBoolToggle(s, checked)}
                disabled={updateSetting.isPending}
              />
              <span className="text-xs font-medium text-muted-foreground">
                {boolValue ? "Enabled" : "Disabled"}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-0.5">
              <Input
                value={currentValue}
                onChange={(e) => setEditValues((prev) => ({ ...prev, [s.id]: e.target.value }))}
                className="h-8 text-sm max-w-[200px]"
              />
              {isDirty && (
                <Button size="sm" variant="default" onClick={() => handleSave(s)} disabled={updateSetting.isPending} className="h-8 gap-1.5">
                  <Save className="h-3.5 w-3.5" /> Save
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Tabs defaultValue="deposits" className="space-y-4">
      <TabsList className="flex-wrap h-auto gap-1 bg-muted/50 p-1">
        {GROUPS.map((g) => (
          <TabsTrigger key={g.id} value={g.id} className="gap-1.5 text-xs data-[state=active]:bg-background">
            {g.icon}
            <span className="hidden sm:inline">{g.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {GROUPS.map((group) => (
        <TabsContent key={group.id} value={group.id} className="space-y-4 mt-0">
          {/* Summary card */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3 pt-4 px-5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                  {group.icon}
                </div>
                <div>
                  <CardTitle className="text-base">{group.label}</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {group.summary(getValue)}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Settings grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            {group.keys.map((key) => renderSetting(key))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
