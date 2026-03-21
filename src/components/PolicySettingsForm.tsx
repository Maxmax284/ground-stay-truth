import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { usePolicySettings, useUpdatePolicySetting, type PolicySetting } from "@/hooks/usePolicySettings";
import { Skeleton } from "@/components/ui/skeleton";
import { Save } from "lucide-react";

const CANCELLATION_KEYS = new Set([
  "free_cancellation_days",
  "partial_refund_days",
  "partial_refund_percentage",
  "no_refund_hours",
  "earliest_checkin_time",
  "checkout_time",
]);

const BOOLEAN_KEYS = new Set([
  "ai_assistant_enabled",
  "ai_guest_enabled",
  "ai_front_desk_enabled",
  "ai_supervisor_enabled",
  "ai_manager_enabled",
  "ai_admin_enabled",
  "deposits_online_enabled",
  "deposits_manual_enabled",
  "deposits_require_online_when_enabled",
  "loyalty_pricing_enabled",
  "loyalty_discount_stacks_with_long_stay",
  "security_deposit_required",
  "email_deposit_reminder_enabled",
  "email_welcome_enabled",
]);

export function PolicySettingsForm() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = usePolicySettings();
  const updateSetting = useUpdatePolicySetting();
  const { toast } = useToast();
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  if (isLoading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  // Filter out cancellation keys — those have their own dedicated editor
  const filteredSettings = settings?.filter((s) => !CANCELLATION_KEYS.has(s.key)) ?? [];
  if (!filteredSettings.length) return <p className="text-sm text-muted-foreground">{t("pricing.noPolicies")}</p>;

  const handleSave = async (setting: PolicySetting) => {
    const rawValue = editValues[setting.id]; if (rawValue === undefined) return;
    let parsed: any = rawValue; const num = Number(rawValue); if (!isNaN(num) && rawValue.trim() !== "") parsed = num;
    try {
      await updateSetting.mutateAsync({ id: setting.id, value: parsed });
      toast({ title: t("pricing.policyUpdated"), description: `${setting.key} saved.` });
      setEditValues((prev) => { const next = { ...prev }; delete next[setting.id]; return next; });
    } catch (err: any) { toast({ title: t("common.error"), description: err.message, variant: "destructive" }); }
  };

  const handleBoolToggle = async (setting: PolicySetting, checked: boolean) => {
    try {
      await updateSetting.mutateAsync({ id: setting.id, value: String(checked) });
      toast({ title: t("pricing.policyUpdated"), description: `${setting.key} saved.` });
    } catch (err: any) { toast({ title: t("common.error"), description: err.message, variant: "destructive" }); }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {settings.map((s) => {
        const isBool = BOOLEAN_KEYS.has(s.key);
        const boolValue = String(s.value) === "true";
        const currentValue = editValues[s.id] ?? String(typeof s.value === "object" ? JSON.stringify(s.value) : s.value);
        const isDirty = editValues[s.id] !== undefined;
        const label = t(`policyLabels.${s.key}`, { defaultValue: s.key });
        return (
          <Card key={s.id} className="relative">
            <CardContent className="pt-5 pb-4 space-y-2">
              <Label className="text-sm font-medium">{label}</Label>
              {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
              {isBool ? (
                <div className="flex items-center gap-3">
                  <Switch
                    checked={boolValue}
                    onCheckedChange={(checked) => handleBoolToggle(s, checked)}
                    disabled={updateSetting.isPending}
                  />
                  <span className="text-sm text-muted-foreground">
                    {boolValue ? t("common.yes") : t("common.no")}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input value={currentValue} onChange={(e) => setEditValues((prev) => ({ ...prev, [s.id]: e.target.value }))} className="flex-1" />
                  {isDirty && <Button size="icon" variant="outline" onClick={() => handleSave(s)} disabled={updateSetting.isPending}><Save className="h-4 w-4" /></Button>}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
