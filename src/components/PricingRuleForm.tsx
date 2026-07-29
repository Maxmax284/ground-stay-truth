import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCreatePricingRule, useUpdatePricingRule, type PricingRule } from "@/hooks/usePricingRules";
import { useUnits } from "@/hooks/useUnits";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { formatPrice } from "@/lib/currency";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";

interface PricingRuleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: PricingRule | null;
  defaultUnitId?: string;
}

interface FormValues {
  name: string;
  scope: "group" | "unit";
  unit_id: string;
  group_id: string;
  start_date: string;
  end_date: string;
  price: number;
  weekend_price: string;
  adjustment_type: "absolute" | "percentage";
  adjustment_value: string;
  min_nights: string;
}

export function PricingRuleForm({ open, onOpenChange, rule, defaultUnitId }: PricingRuleFormProps) {
  const { t } = useTranslation();
  const isEditing = !!rule;
  const { toast } = useToast();
  const createRule = useCreatePricingRule();
  const updateRule = useUpdatePricingRule();
  const { data: units } = useUnits();
  const { data: groups } = useUnitGroups();
  const { data: policies } = usePolicySettings();

  const [weekendOpen, setWeekendOpen] = useState(false);

  const initialValues = (): FormValues => ({
    name: rule?.name ?? "",
    scope: (rule as any)?.group_id ? "group" : rule ? "unit" : "group",
    unit_id: rule?.unit_id ?? defaultUnitId ?? "",
    group_id: (rule as any)?.group_id ?? "",
    start_date: rule?.start_date ?? "",
    end_date: rule?.end_date ?? "",
    price: rule?.price ?? 0,
    weekend_price: rule?.weekend_price != null ? String(rule.weekend_price) : "",
    adjustment_type: (rule as any)?.adjustment_type ?? "absolute",
    adjustment_value: (rule as any)?.adjustment_value != null ? String((rule as any).adjustment_value) : "",
    min_nights: (rule as any)?.min_nights != null ? String((rule as any).min_nights) : "",
  });

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: initialValues(),
  });

  const scope = watch("scope");
  const selectedUnitId = watch("unit_id");
  const selectedGroupId = watch("group_id");
  const adjustmentType = watch("adjustment_type");
  const adjustmentValue = watch("adjustment_value");
  const activeUnits = units?.filter((u) => u.is_active) ?? [];
  const activeGroups = groups ?? [];
  // Rooms in the chosen type — used for the "this covers X rooms" hint and
  // as the price reference for percentage previews on group rules.
  const groupUnits = activeUnits.filter((u) => u.group_id === selectedGroupId);
  const selectedUnit =
    scope === "group" ? groupUnits[0] : activeUnits.find((u) => u.id === selectedUnitId);

  // Reset form when rule changes
  useEffect(() => {
    if (open) {
      reset(initialValues());
      setWeekendOpen(rule?.weekend_price != null && Number(rule.weekend_price) > 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule, defaultUnitId, reset]);

  // Percentage preview calculation
  const percentagePreview = (() => {
    if (adjustmentType !== "percentage" || !selectedUnit || !adjustmentValue) return null;
    const pct = Number(adjustmentValue);
    if (isNaN(pct)) return null;
    const basePreview = Math.round(Number(selectedUnit.base_price) * (1 + pct / 100) * 100) / 100;
    const weekendBase = selectedUnit.weekend_price != null ? Number(selectedUnit.weekend_price) : null;
    const weekendPreview = weekendBase && weekendBase > 0
      ? Math.round(weekendBase * (1 + pct / 100) * 100) / 100
      : null;
    return { base: basePreview, weekend: weekendPreview };
  })();


  const onSubmit = async (data: FormValues) => {
    try {
      const isGroupScope = data.scope === "group";
      if (isGroupScope && !data.group_id) {
        toast({ title: "Pick a room type", variant: "destructive" });
        return;
      }
      if (!isGroupScope && !data.unit_id) {
        toast({ title: "Pick a room", variant: "destructive" });
        return;
      }

      const payload: any = {
        name: data.name,
        // Exactly one scope is stored — the DB enforces this too.
        unit_id: isGroupScope ? null : data.unit_id,
        group_id: isGroupScope ? data.group_id : null,
        start_date: data.start_date,
        end_date: data.end_date,
        price: data.adjustment_type === "percentage" && selectedUnit
          ? Math.round(Number(selectedUnit.base_price) * (1 + Number(data.adjustment_value || 0) / 100) * 100) / 100
          : Number(data.price),
        weekend_price: data.weekend_price ? Number(data.weekend_price) : null,
        adjustment_type: data.adjustment_type,
        adjustment_value: data.adjustment_type === "percentage" ? Number(data.adjustment_value || 0) : null,
        min_nights: data.min_nights ? Number(data.min_nights) : null,
      };


      if (isEditing && rule) {
        await updateRule.mutateAsync({ id: rule.id, ...payload });
        toast({ title: t("pricing.ruleUpdated") });
      } else {
        await createRule.mutateAsync(payload);
        toast({ title: t("pricing.ruleCreated") });
      }
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? t("pricing.editRule") : t("pricing.addSeasonalRule")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label>{t("pricing.ruleName")} *</Label>
            <Input {...register("name", { required: true })} placeholder="e.g. Summer Peak" />
            {errors.name && <p className="text-sm text-destructive">{t("common.required")}</p>}
          </div>

          {/* Unit */}
          <div className="space-y-2">
            <Label>{t("bookings.unit")} *</Label>
            <Select value={selectedUnitId} onValueChange={(v) => setValue("unit_id", v)}>
              <SelectTrigger><SelectValue placeholder={t("bookingForm.selectUnit")} /></SelectTrigger>
              <SelectContent>
                {activeUnits.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <input type="hidden" {...register("unit_id", { required: true })} />
            {errors.unit_id && <p className="text-sm text-destructive">{t("common.required")}</p>}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("maintenanceBlock.startDate")} *</Label>
              <Input type="date" {...register("start_date", { required: true })} />
              {errors.start_date && <p className="text-sm text-destructive">{t("common.required")}</p>}
            </div>
            <div className="space-y-2">
              <Label>{t("maintenanceBlock.endDate")} *</Label>
              <Input type="date" {...register("end_date", { required: true })} />
              {errors.end_date && <p className="text-sm text-destructive">{t("common.required")}</p>}
            </div>
          </div>

          {/* Pricing Mode */}
          <div className="space-y-2">
            <Label>Pricing Mode</Label>
            <Select value={adjustmentType} onValueChange={(v) => setValue("adjustment_type", v as "absolute" | "percentage")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="absolute">Exact Price</SelectItem>
                <SelectItem value="percentage">% Adjustment from Base</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Exact Price Mode */}
          {adjustmentType === "absolute" && (
            <>
              <div className="space-y-2">
                <Label>{t("pricing.nightlyPrice")} *</Label>
                <Input type="number" step="0.01" min={0} {...register("price", { required: adjustmentType === "absolute" })} />
                {errors.price && <p className="text-sm text-destructive">{t("common.required")}</p>}
              </div>

              <Collapsible open={weekendOpen} onOpenChange={setWeekendOpen}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
                    Weekend Rate (optional)
                    <ChevronDown className={`h-4 w-4 transition-transform ${weekendOpen ? "rotate-180" : ""}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="space-y-2">
                    <Label>Weekend Price</Label>
                    <Input type="number" step="0.01" min={0} {...register("weekend_price")} placeholder="Leave blank to use weekday rate" />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </>
          )}

          {/* Percentage Mode */}
          {adjustmentType === "percentage" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Adjustment %</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="1"
                    {...register("adjustment_value", { required: adjustmentType === "percentage" })}
                    placeholder="e.g. -20 or +15"
                    className="flex-1"
                  />
                  <span className="text-muted-foreground text-sm font-medium">%</span>
                </div>
                {errors.adjustment_value && <p className="text-sm text-destructive">{t("common.required")}</p>}
              </div>

              {percentagePreview && (
                <div className="rounded-md bg-muted/50 border p-3 text-sm space-y-1">
                  <p className="font-medium text-foreground">Preview</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Weekday rate</span>
                    <span className="font-medium">{formatPrice(percentagePreview.base, policies)}/night</span>
                  </div>
                  {percentagePreview.weekend && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Weekend rate</span>
                      <span className="font-medium">{formatPrice(percentagePreview.weekend, policies)}/night</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Min Nights Override */}
          <div className="space-y-2">
            <Label>Min. Nights Override <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              type="number"
              min={1}
              {...register("min_nights")}
              placeholder={selectedUnit ? `Unit default: ${selectedUnit.min_nights}` : "Leave blank for unit default"}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={createRule.isPending || updateRule.isPending}>
              {isEditing ? t("units.saveChanges") : t("pricing.addRule")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
