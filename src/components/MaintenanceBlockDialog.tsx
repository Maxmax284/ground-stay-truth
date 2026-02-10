import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCreateMaintenanceBlock } from "@/hooks/useMaintenanceBlocks";
import type { Unit } from "@/hooks/useUnits";

interface MaintenanceBlockDialogProps { open: boolean; onOpenChange: (open: boolean) => void; units: Unit[]; defaultUnitId?: string; defaultDate?: string; }

export function MaintenanceBlockDialog({ open, onOpenChange, units, defaultUnitId, defaultDate }: MaintenanceBlockDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const createBlock = useCreateMaintenanceBlock();
  const [unitId, setUnitId] = useState(defaultUnitId ?? "");
  const [startDate, setStartDate] = useState(defaultDate ?? "");
  const [endDate, setEndDate] = useState(defaultDate ?? "");
  const [reason, setReason] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitId || !startDate || !endDate) { toast({ title: t("maintenanceBlock.fillFields"), variant: "destructive" }); return; }
    if (endDate < startDate) { toast({ title: t("maintenanceBlock.endAfterStart"), variant: "destructive" }); return; }
    try {
      await createBlock.mutateAsync({ unit_id: unitId, start_date: startDate, end_date: endDate, reason: reason || undefined });
      toast({ title: t("maintenanceBlock.created") }); setUnitId(""); setStartDate(""); setEndDate(""); setReason(""); onOpenChange(false);
    } catch (err: any) { toast({ title: t("common.error"), description: err.message, variant: "destructive" }); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t("maintenanceBlock.title")}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2"><Label>{t("maintenanceBlock.unit")} *</Label><Select value={unitId} onValueChange={setUnitId}><SelectTrigger><SelectValue placeholder={t("bookingForm.selectUnit")} /></SelectTrigger><SelectContent>{units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>{t("maintenanceBlock.startDate")} *</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>{t("maintenanceBlock.endDate")} *</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>{t("maintenanceBlock.reason")}</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("maintenanceBlock.reasonPlaceholder")} rows={2} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button><Button type="submit" disabled={createBlock.isPending}>{createBlock.isPending ? t("common.creating") : t("maintenanceBlock.blockDates")}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
