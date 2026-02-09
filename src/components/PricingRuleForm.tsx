import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCreatePricingRule, useUpdatePricingRule, type PricingRule } from "@/hooks/usePricingRules";
import { useUnits } from "@/hooks/useUnits";

interface PricingRuleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: PricingRule | null;
  defaultUnitId?: string;
}

interface FormValues {
  name: string;
  unit_id: string;
  start_date: string;
  end_date: string;
  price: number;
}

export function PricingRuleForm({ open, onOpenChange, rule, defaultUnitId }: PricingRuleFormProps) {
  const isEditing = !!rule;
  const { toast } = useToast();
  const createRule = useCreatePricingRule();
  const updateRule = useUpdatePricingRule();
  const { data: units } = useUnits();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      name: rule?.name ?? "",
      unit_id: rule?.unit_id ?? defaultUnitId ?? "",
      start_date: rule?.start_date ?? "",
      end_date: rule?.end_date ?? "",
      price: rule?.price ?? 0,
    },
  });

  const selectedUnitId = watch("unit_id");
  const activeUnits = units?.filter((u) => u.is_active) ?? [];

  const onSubmit = async (data: FormValues) => {
    try {
      if (isEditing && rule) {
        await updateRule.mutateAsync({ id: rule.id, ...data, price: Number(data.price) });
        toast({ title: "Rule updated" });
      } else {
        await createRule.mutateAsync({ ...data, price: Number(data.price) });
        toast({ title: "Rule created" });
      }
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Seasonal Rule" : "Add Seasonal Rule"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Rule Name *</Label>
            <Input {...register("name", { required: true })} placeholder="e.g. Summer Peak" />
            {errors.name && <p className="text-sm text-destructive">Required</p>}
          </div>

          <div className="space-y-2">
            <Label>Unit *</Label>
            <Select value={selectedUnitId} onValueChange={(v) => setValue("unit_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
              <SelectContent>
                {activeUnits.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" {...register("unit_id", { required: true })} />
            {errors.unit_id && <p className="text-sm text-destructive">Required</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input type="date" {...register("start_date", { required: true })} />
              {errors.start_date && <p className="text-sm text-destructive">Required</p>}
            </div>
            <div className="space-y-2">
              <Label>End Date *</Label>
              <Input type="date" {...register("end_date", { required: true })} />
              {errors.end_date && <p className="text-sm text-destructive">Required</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nightly Price *</Label>
            <Input type="number" step="0.01" min={0} {...register("price", { required: true })} />
            {errors.price && <p className="text-sm text-destructive">Required</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createRule.isPending || updateRule.isPending}>
              {isEditing ? "Save Changes" : "Add Rule"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
