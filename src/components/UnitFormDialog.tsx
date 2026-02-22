import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCreateUnit, useUpdateUnit, type Unit, type UnitInsert } from "@/hooks/useUnits";
import { useUnitGroups } from "@/hooks/useUnitGroups";
import { UnitPhotoUpload } from "@/components/UnitPhotoUpload";

interface UnitFormDialogProps { open: boolean; onOpenChange: (open: boolean) => void; unit?: Unit | null; }

const AMENITY_OPTIONS = ["WiFi", "Air Conditioning", "Kitchen", "Pool", "Parking", "Washer/Dryer", "TV", "Hot Tub", "Balcony", "Pet Friendly", "Fireplace", "BBQ Grill", "Ocean View", "Garden"];

export function UnitFormDialog({ open, onOpenChange, unit }: UnitFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = !!unit;
  const { toast } = useToast();
  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();
  const { data: groups } = useUnitGroups();

  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(unit?.amenities ?? []);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(unit?.group_id ?? "none");
  const [photos, setPhotos] = useState<string[]>(unit?.photos ?? []);
  const [savedUnitId, setSavedUnitId] = useState<string | undefined>(unit?.id);
  const [isEditingAfterCreate, setIsEditingAfterCreate] = useState(false);

  useEffect(() => { setSelectedAmenities(unit?.amenities ?? []); setSelectedGroupId(unit?.group_id ?? "none"); setPhotos(unit?.photos ?? []); setSavedUnitId(unit?.id); setIsEditingAfterCreate(false); }, [unit]);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { name: unit?.name ?? "", description: unit?.description ?? "", capacity: unit?.capacity ?? 2, min_nights: unit?.min_nights ?? 1, base_price: unit?.base_price ?? 0, weekend_price: unit?.weekend_price ?? undefined, cleaning_fee: unit?.cleaning_fee ?? 0, rules: unit?.rules ?? "", is_active: unit?.is_active ?? true, reviews_enabled: (unit as any)?.reviews_enabled ?? true },
  });

  const toggleAmenity = (amenity: string) => setSelectedAmenities((prev) => prev.includes(amenity) ? prev.filter((a) => a !== amenity) : [...prev, amenity]);

  const onSubmit = async (data: any) => {
    try {
      const payload = { ...data, amenities: selectedAmenities, photos, group_id: selectedGroupId === "none" ? null : selectedGroupId, base_price: Number(data.base_price), weekend_price: data.weekend_price ? Number(data.weekend_price) : null, cleaning_fee: Number(data.cleaning_fee), capacity: Number(data.capacity), min_nights: Number(data.min_nights) };
      if ((isEditing || isEditingAfterCreate) && (unit || savedUnitId)) {
        const id = unit?.id ?? savedUnitId!;
        await updateUnit.mutateAsync({ id, ...payload }); toast({ title: t("units.unitUpdated") }); reset(); onOpenChange(false);
      } else {
        const result = await createUnit.mutateAsync(payload as UnitInsert); setSavedUnitId(result.id); setIsEditingAfterCreate(true); toast({ title: t("units.unitCreated") });
      }
    } catch (err: any) { toast({ title: t("common.error"), description: err.message, variant: "destructive" }); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEditing || isEditingAfterCreate ? t("units.editUnit") : t("units.addUnit")}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="name">{t("units.name")} *</Label><Input id="name" {...register("name", { required: true })} placeholder="Beach House A" />{errors.name && <p className="text-sm text-destructive">{t("common.required")}</p>}</div>
          <div className="space-y-2"><Label htmlFor="description">{t("units.description")}</Label><Textarea id="description" {...register("description")} placeholder="A cozy beachfront retreat…" rows={3} /></div>
          {groups && groups.length > 0 && (
            <div className="space-y-2"><Label>{t("units.group")}</Label><Select value={selectedGroupId} onValueChange={setSelectedGroupId}><SelectTrigger><SelectValue placeholder={t("units.noGroup")} /></SelectTrigger><SelectContent><SelectItem value="none">{t("units.noGroup")}</SelectItem>{groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label htmlFor="capacity">{t("units.capacity")}</Label><Input id="capacity" type="number" min={1} {...register("capacity")} /></div>
            <div className="space-y-2"><Label htmlFor="min_nights">{t("units.minNights")}</Label><Input id="min_nights" type="number" min={1} {...register("min_nights")} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2"><Label htmlFor="base_price">{t("units.basePrice")}</Label><Input id="base_price" type="number" step="0.01" min={0} {...register("base_price")} /></div>
            <div className="space-y-2"><Label htmlFor="weekend_price">{t("units.weekendPrice")}</Label><Input id="weekend_price" type="number" step="0.01" min={0} {...register("weekend_price")} /></div>
            <div className="space-y-2"><Label htmlFor="cleaning_fee">{t("units.cleaningFee")}</Label><Input id="cleaning_fee" type="number" step="0.01" min={0} {...register("cleaning_fee")} /></div>
          </div>
          <div className="space-y-2"><Label>{t("units.amenities")}</Label><div className="flex flex-wrap gap-2">{AMENITY_OPTIONS.map((amenity) => <button key={amenity} type="button" onClick={() => toggleAmenity(amenity)} className={`px-3 py-1 rounded-full text-sm border transition-colors ${selectedAmenities.includes(amenity) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"}`}>{amenity}</button>)}</div></div>
          <div className="space-y-2"><Label>{t("units.photos")}</Label>{savedUnitId ? <UnitPhotoUpload unitId={savedUnitId} photos={photos} onChange={setPhotos} /> : <p className="text-xs text-muted-foreground">{t("units.saveFirst")}</p>}</div>
          <div className="space-y-2"><Label htmlFor="rules">{t("units.houseRules")}</Label><Textarea id="rules" {...register("rules")} placeholder="No smoking, quiet hours after 10pm…" rows={2} /></div>
          <div className="flex items-center justify-between"><Label htmlFor="is_active">{t("common.active")}</Label><Switch id="is_active" defaultChecked={unit?.is_active ?? true} {...register("is_active")} /></div>
          <div className="flex items-center justify-between"><Label htmlFor="reviews_enabled">{t("units.reviewsEnabled", { defaultValue: "Reviews Enabled" })}</Label><Switch id="reviews_enabled" defaultChecked={(unit as any)?.reviews_enabled ?? true} {...register("reviews_enabled" as any)} /></div>
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button><Button type="submit" disabled={createUnit.isPending || updateUnit.isPending}>{isEditing || isEditingAfterCreate ? t("units.saveChanges") : t("units.addUnit")}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
