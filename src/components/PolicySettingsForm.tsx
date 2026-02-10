import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { usePolicySettings, useUpdatePolicySetting, type PolicySetting } from "@/hooks/usePolicySettings";
import { Skeleton } from "@/components/ui/skeleton";
import { Save } from "lucide-react";

export function PolicySettingsForm() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = usePolicySettings();
  const updateSetting = useUpdatePolicySetting();
  const { toast } = useToast();
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  if (isLoading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (!settings?.length) return <p className="text-sm text-muted-foreground">{t("pricing.noPolicies")}</p>;

  const handleSave = async (setting: PolicySetting) => {
    const rawValue = editValues[setting.id]; if (rawValue === undefined) return;
    let parsed: any = rawValue; const num = Number(rawValue); if (!isNaN(num) && rawValue.trim() !== "") parsed = num;
    try {
      await updateSetting.mutateAsync({ id: setting.id, value: parsed });
      toast({ title: t("pricing.policyUpdated"), description: `${setting.key} saved.` });
      setEditValues((prev) => { const next = { ...prev }; delete next[setting.id]; return next; });
    } catch (err: any) { toast({ title: t("common.error"), description: err.message, variant: "destructive" }); }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {settings.map((s) => {
        const currentValue = editValues[s.id] ?? String(typeof s.value === "object" ? JSON.stringify(s.value) : s.value);
        const isDirty = editValues[s.id] !== undefined;
        const label = t(`policyLabels.${s.key}`, { defaultValue: s.key });
        return (
          <Card key={s.id} className="relative">
            <CardContent className="pt-5 pb-4 space-y-2">
              <Label className="text-sm font-medium">{label}</Label>
              {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
              <div className="flex items-center gap-2">
                <Input value={currentValue} onChange={(e) => setEditValues((prev) => ({ ...prev, [s.id]: e.target.value }))} className="flex-1" />
                {isDirty && <Button size="icon" variant="outline" onClick={() => handleSave(s)} disabled={updateSetting.isPending}><Save className="h-4 w-4" /></Button>}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
