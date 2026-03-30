import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { Plus } from "lucide-react";
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
  const [customAmenity, setCustomAmenity] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>(unit?.group_id ?? "none");
  const [photos, setPhotos] = useState<string[]>(unit?.photos ?? []);
  const [savedUnitId, setSavedUnitId] = useState<string | undefined>(unit?.id);
  const [isEditingAfterCreate, setIsEditingAfterCreate] = useState(false);
  const [isActive, setIsActive] = useState(unit?.is_active ?? true);
  const [reviewsEnabled, setReviewsEnabled] = useState((unit as any)?.reviews_enabled ?? true);
  const [pricingType, setPricingType] = useState<string>((unit as any)?.pricing_type ?? "per_room");

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { name: unit?.name ?? "", description: unit?.description ?? "", capacity: unit?.capacity ?? 2, min_nights: unit?.min_nights ?? 1, base_price: unit?.base_price ?? 0, weekend_price: unit?.weekend_price ?? undefined, cleaning_fee: unit?.cleaning_fee ?? 0, weekly_rate: (unit as any)?.weekly_rate ?? undefined, monthly_rate: (unit as any)?.monthly_rate ?? undefined, sort_order: (unit as any)?.sort_order ?? 0, rules: unit?.rules ?? "", wifi_network: (unit as any)?.wifi_network ?? "", wifi_password: (unit as any)?.wifi_password ?? "", house_rules_detail: (unit as any)?.house_rules_detail ?? "", emergency_contact_name: (unit as any)?.emergency_contact_name ?? "", emergency_contact_phone: (unit as any)?.emergency_contact_phone ?? "" },
  });

  useEffect(() => {
    setSelectedAmenities(unit?.amenities ?? []); setCustomAmenity(""); setSelectedGroupId(unit?.group_id ?? "none"); setPhotos(unit?.photos ?? []); setSavedUnitId(unit?.id); setIsEditingAfterCreate(false); setIsActive(unit?.is_active ?? true); setReviewsEnabled((unit as any)?.reviews_enabled ?? true); setPricingType((unit as any)?.pricing_type ?? "per_room");
    reset({ name: unit?.name ?? "", description: unit?.description ?? "", capacity: unit?.capacity ?? 2, min_nights: unit?.min_nights ?? 1, base_price: unit?.base_price ?? 0, weekend_price: unit?.weekend_price ?? undefined, cleaning_fee: unit?.cleaning_fee ?? 0, weekly_rate: (unit as any)?.weekly_rate ?? undefined, monthly_rate: (unit as any)?.monthly_rate ?? undefined, sort_order: (unit as any)?.sort_order ?? 0, rules: unit?.rules ?? "", wifi_network: (unit as any)?.wifi_network ?? "", wifi_password: (unit as any)?.wifi_password ?? "", house_rules_detail: (unit as any)?.house_rules_detail ?? "", emergency_contact_name: (unit as any)?.emergency_contact_name ?? "", emergency_contact_phone: (unit as any)?.emergency_contact_phone ?? "" });
  }, [unit, reset]);

  const allAmenityOptions = useMemo(() => {
    const extras = selectedAmenities.filter((a) => !AMENITY_OPTIONS.includes(a));
    return [...AMENITY_OPTIONS, ...extras];
  }, [selectedAmenities]);

  const addCustomAmenity = () => {
    const trimmed = customAmenity.trim();
    if (!trimmed || selectedAmenities.includes(trimmed) || AMENITY_OPTIONS.includes(trimmed)) return;
    setSelectedAmenities((prev) => [...prev, trimmed]);
    setCustomAmenity("");
  };

  const toggleAmenity = (amenity: string) => setSelectedAmenities((prev) => prev.includes(amenity) ? prev.filter((a) => a !== amenity) : [...prev, amenity]);

  const onSubmit = async (data: any) => {
    try {
      const payload = { ...data, amenities: selectedAmenities, photos, group_id: selectedGroupId === "none" ? null : selectedGroupId, base_price: Number(data.base_price), weekend_price: data.weekend_price ? Number(data.weekend_price) : null, cleaning_fee: Number(data.cleaning_fee), weekly_rate: data.weekly_rate ? Number(data.weekly_rate) : null, monthly_rate: data.monthly_rate ? Number(data.monthly_rate) : null, sort_order: Number(data.sort_order ?? 0), capacity: Number(data.capacity), min_nights: Number(data.min_nights), is_active: isActive, reviews_enabled: reviewsEnabled, pricing_type: pricingType, wifi_network: data.wifi_network || null, wifi_password: data.wifi_password || null, house_rules_detail: data.house_rules_detail || null, emergency_contact_name: data.emergency_contact_name || null, emergency_contact_phone: data.emergency_contact_phone || null };
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
          <div className="space-y-2">
            <Label>Pricing Type</Label>
            <Select value={pricingType} onValueChange={setPricingType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="per_room">Per Room</SelectItem>
                <SelectItem value="per_person">Per Person</SelectItem>
              </SelectContent>
            </Select>
            {pricingType === "per_person" && <p className="text-xs text-muted-foreground">Prices below are per person. Total will be calculated × capacity automatically.</p>}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2"><Label htmlFor="base_price">{pricingType === "per_person" ? "Base Price / Person" : t("units.basePrice")}</Label><Input id="base_price" type="number" step="0.01" min={0} {...register("base_price")} /></div>
            <div className="space-y-2"><Label htmlFor="weekend_price">{pricingType === "per_person" ? "Weekend / Person" : t("units.weekendPrice")}</Label><Input id="weekend_price" type="number" step="0.01" min={0} {...register("weekend_price")} /></div>
            <div className="space-y-2"><Label htmlFor="cleaning_fee">{t("units.cleaningFee")}</Label><Input id="cleaning_fee" type="number" step="0.01" min={0} {...register("cleaning_fee")} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2"><Label htmlFor="weekly_rate">{t("units.weeklyRate", { defaultValue: "Weekly Rate" })}</Label><Input id="weekly_rate" type="number" step="0.01" min={0} {...register("weekly_rate")} placeholder="Optional" /></div>
            <div className="space-y-2"><Label htmlFor="monthly_rate">{t("units.monthlyRate", { defaultValue: "Monthly Rate" })}</Label><Input id="monthly_rate" type="number" step="0.01" min={0} {...register("monthly_rate")} placeholder="Optional" /></div>
            <div className="space-y-2"><Label htmlFor="sort_order">{t("units.sortOrder", { defaultValue: "Sort Order" })}</Label><Input id="sort_order" type="number" min={0} {...register("sort_order")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label htmlFor="max_extra_beds">Max Extra Beds</Label><Input id="max_extra_beds" type="number" min={0} max={5} {...register("max_extra_beds")} /><p className="text-xs text-muted-foreground">0 = no extra beds available</p></div>
            <div className="space-y-2"><Label htmlFor="extra_bed_fee">Extra Bed Fee / Night</Label><Input id="extra_bed_fee" type="number" step="0.01" min={0} {...register("extra_bed_fee")} placeholder="0" /></div>
          </div>
          <div className="space-y-2"><Label>{t("units.amenities")}</Label><div className="flex flex-wrap gap-2">{allAmenityOptions.map((amenity) => <button key={amenity} type="button" onClick={() => toggleAmenity(amenity)} className={`px-3 py-1 rounded-full text-sm border transition-colors ${selectedAmenities.includes(amenity) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"}`}>{amenity}</button>)}</div><div className="flex gap-2 mt-2"><Input placeholder={t("units.customAmenityPlaceholder", { defaultValue: "Add custom amenity…" })} value={customAmenity} onChange={(e) => setCustomAmenity(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomAmenity(); } }} className="flex-1" /><Button type="button" size="sm" variant="outline" onClick={addCustomAmenity} disabled={!customAmenity.trim()}><Plus className="h-4 w-4" /></Button></div></div>
          <div className="space-y-2"><Label>{t("units.photos")}</Label>{savedUnitId ? <UnitPhotoUpload unitId={savedUnitId} photos={photos} onChange={setPhotos} /> : <p className="text-xs text-muted-foreground">{t("units.saveFirst")}</p>}</div>
          <div className="space-y-2"><Label htmlFor="rules">{t("units.houseRules")}</Label><Textarea id="rules" {...register("rules")} placeholder="No smoking, quiet hours after 10pm…" rows={2} /></div>

          {/* Stay Essentials — per-unit overrides */}
          <div className="space-y-3 rounded-lg border border-border/50 p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stay Essentials (per-unit overrides)</p>
            <p className="text-[11px] text-muted-foreground -mt-2">Leave blank to use global defaults from Policy Settings.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label htmlFor="wifi_network" className="text-xs">WiFi Network</Label><Input id="wifi_network" {...register("wifi_network")} placeholder="Global default" className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label htmlFor="wifi_password" className="text-xs">WiFi Password</Label><Input id="wifi_password" {...register("wifi_password")} placeholder="Global default" className="h-8 text-sm" /></div>
            </div>
            <div className="space-y-1"><Label htmlFor="house_rules_detail" className="text-xs">House Rules</Label><Textarea id="house_rules_detail" {...register("house_rules_detail")} placeholder="Global default" rows={2} className="text-sm" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label htmlFor="emergency_contact_name" className="text-xs">Emergency Contact</Label><Input id="emergency_contact_name" {...register("emergency_contact_name")} placeholder="Global default" className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label htmlFor="emergency_contact_phone" className="text-xs">Emergency Phone</Label><Input id="emergency_contact_phone" {...register("emergency_contact_phone")} placeholder="Global default" className="h-8 text-sm" /></div>
            </div>
          </div>
          <div className="flex items-center justify-between"><Label htmlFor="is_active">{t("common.active")}</Label><Switch id="is_active" checked={isActive} onCheckedChange={setIsActive} /></div>
          <div className="flex items-center justify-between"><Label htmlFor="reviews_enabled">{t("units.reviewsEnabled", { defaultValue: "Reviews Enabled" })}</Label><Switch id="reviews_enabled" checked={reviewsEnabled} onCheckedChange={setReviewsEnabled} /></div>
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button><Button type="submit" disabled={createUnit.isPending || updateUnit.isPending}>{isEditing || isEditingAfterCreate ? t("units.saveChanges") : t("units.addUnit")}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
