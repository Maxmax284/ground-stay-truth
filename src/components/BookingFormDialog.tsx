import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, addHours, startOfDay, parseISO } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCreateBooking } from "@/hooks/useBookings";
import { useUnits } from "@/hooks/useUnits";
import { usePricingRules } from "@/hooks/usePricingRules";
import { useMaintenanceBlocks } from "@/hooks/useMaintenanceBlocks";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { useAuth } from "@/hooks/useAuth";
import { useProperty } from "@/hooks/useProperty";
import { permissions } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { calculatePricing, type PricingSummary } from "@/lib/pricingCalculator";
import { formatPrice } from "@/lib/currency";
import { getGuestTypesForMode, DEFAULT_GUEST_TYPE } from "@/lib/guestTypes";
import { AlertTriangle } from "lucide-react";

interface BookingFormDialogProps { open: boolean; onOpenChange: (open: boolean) => void; defaultUnitId?: string; defaultCheckIn?: string; defaultCheckOut?: string; }
interface FormValues { unit_id: string; check_in: string; check_out: string; num_guests: number; extra_beds: number; notes: string; guest_id: string; guest_type: string; flight_number: string; manual_guest_name: string; manual_guest_email: string; manual_guest_phone: string; }

export function BookingFormDialog({ open, onOpenChange, defaultUnitId, defaultCheckIn, defaultCheckOut }: BookingFormDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { role } = useAuth();
  const { operationalMode } = useProperty();
  const createBooking = useCreateBooking();
  const { data: units } = useUnits();
  const { data: allPricingRules } = usePricingRules();
  const { data: policies } = usePolicySettings();
  const [guestSearch, setGuestSearch] = useState("");
  const guestTypeOptions = getGuestTypesForMode(operationalMode);
  const defaultGuestType = DEFAULT_GUEST_TYPE[operationalMode ?? "high_turnover"] ?? guestTypeOptions[0]?.value ?? "";

  const guestProfiles = useQuery({
    queryKey: ["guest-profiles"],
    queryFn: async () => { const { data, error } = await supabase.from("profiles").select("user_id, full_name, email").order("full_name", { ascending: true }); if (error) throw error; return data; },
  });

  const filteredGuests = (guestProfiles.data ?? []).filter((p) => {
    if (!guestSearch) return true;
    const q = guestSearch.toLowerCase();
    return (p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q));
  });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: { unit_id: defaultUnitId ?? "", check_in: defaultCheckIn ?? "", check_out: defaultCheckOut ?? "", num_guests: 1, extra_beds: 0, notes: "", guest_id: "", guest_type: defaultGuestType, flight_number: "", manual_guest_name: "", manual_guest_email: "", manual_guest_phone: "" },
  });

  const selectedUnitId = watch("unit_id");
  const selectedGuestId = watch("guest_id");
  const checkIn = watch("check_in");
  const checkOut = watch("check_out");
  const numGuests = watch("num_guests");
  const extraBeds = watch("extra_beds");
  const activeUnits = units?.filter((u) => u.is_active) ?? [];
  const selectedUnit = activeUnits.find((u) => u.id === selectedUnitId);

  const { data: maintenanceBlocks } = useMaintenanceBlocks({ unitId: selectedUnitId || undefined, dateFrom: checkIn || undefined, dateTo: checkOut || undefined });
  const existingBookings = useQuery({
    queryKey: ["unit-bookings-for-validation", selectedUnitId, checkIn, checkOut],
    enabled: !!selectedUnitId && !!checkIn && !!checkOut,
    queryFn: async () => { const { data, error } = await supabase.from("bookings").select("id, check_in, check_out, state").eq("unit_id", selectedUnitId).not("state", "in", '("cancelled","no_show")').gte("check_out", checkIn).lte("check_in", checkOut); if (error) throw error; return data; },
  });

  const cleaningBufferHours = useMemo(() => { const setting = policies?.find((p) => p.key === "cleaning_buffer_hours"); return setting ? Number(setting.value) : 4; }, [policies]);
  const isAdminRole = permissions.canAdminOverride(role);

  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    if (!selectedUnit || !checkIn || !checkOut) return errs;
    const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
    if (nights <= 0) errs.push(t("bookingForm.checkoutAfterCheckin"));
    else {
      const unitRules = (allPricingRules ?? []).filter((r) => r.unit_id === selectedUnit.id);
      const seasonalRule = unitRules.find(
        (r) => r.min_nights != null && r.min_nights > 0 && checkIn >= r.start_date && checkIn <= r.end_date
      );
      const effectiveMinNights = seasonalRule?.min_nights ?? selectedUnit.min_nights;
      if (nights < effectiveMinNights) {
        if (seasonalRule) {
          errs.push(t("bookingForm.seasonalMinStay", { ruleName: seasonalRule.name, count: effectiveMinNights }));
        } else {
          errs.push(t("bookingForm.minStay", { count: selectedUnit.min_nights }));
        }
      }
    }
    if (maintenanceBlocks?.length) {
      for (const block of maintenanceBlocks) {
        if (block.start_date <= checkOut && block.end_date >= checkIn) {
          errs.push(t("bookingForm.maintenanceConflict", { start: block.start_date, end: block.end_date, reason: block.reason ? ` (${block.reason})` : "" }));
          break;
        }
      }
    }
    if (existingBookings.data?.length && cleaningBufferHours > 0) {
      for (const existing of existingBookings.data) {
        const existingCheckOut = new Date(existing.check_out);
        const bufferEnd = addHours(existingCheckOut, cleaningBufferHours);
        const newCheckIn = startOfDay(parseISO(checkIn));
        if (newCheckIn >= existingCheckOut && newCheckIn < startOfDay(bufferEnd)) {
          if (!isAdminRole) errs.push(t("bookingForm.bufferConflict", { hours: cleaningBufferHours, date: existing.check_out }));
          break;
        }
      }
    }
    return errs;
  }, [selectedUnit, checkIn, checkOut, numGuests, maintenanceBlocks, existingBookings.data, cleaningBufferHours, isAdminRole, t]);

  const bufferWarning = useMemo(() => {
    if (!isAdminRole || !selectedUnit || !checkIn || !checkOut || !existingBookings.data?.length) return null;
    for (const existing of existingBookings.data) {
      const existingCheckOut = new Date(existing.check_out);
      const bufferEnd = addHours(existingCheckOut, cleaningBufferHours);
      const newCheckIn = startOfDay(parseISO(checkIn));
      if (newCheckIn >= existingCheckOut && newCheckIn < startOfDay(bufferEnd)) return t("bookingForm.bufferWarning", { hours: cleaningBufferHours });
    }
    return null;
  }, [isAdminRole, selectedUnit, checkIn, checkOut, existingBookings.data, cleaningBufferHours, t]);

  const pricing: PricingSummary = useMemo(() => {
    if (!selectedUnit || !checkIn || !checkOut || validationErrors.length > 0) return { nights: [], subtotal: 0, cleaningFee: 0, extraBedTotal: 0, longStayDiscount: null, loyaltyDiscount: null, total: 0 };
    return calculatePricing(selectedUnit, checkIn, checkOut, allPricingRules ?? [], undefined, policies, undefined, Number(extraBeds) || 0, Number(numGuests) || 1);
  }, [selectedUnit, checkIn, checkOut, allPricingRules, validationErrors, policies, extraBeds, numGuests]);


  const todayBkk = useMemo(
    () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()),
    []
  );
  const isBackdated = !!checkIn && checkIn < todayBkk;
  const canBackdate = role === "admin" || role === "manager" || role === "front_desk_supervisor";
  const [backdateReason, setBackdateReason] = useState("");

  const onSubmit = async (data: FormValues) => {
    if (validationErrors.length > 0) return;
    if (isBackdated && !canBackdate) {
      toast({ title: t("common.error"), description: "Only a manager or front-desk supervisor can record a backdated booking. Ask a supervisor to create it, or set check-in to today or later.", variant: "destructive" });
      return;
    }
    if (isBackdated && !backdateReason.trim()) {
      toast({ title: t("common.error"), description: "Backdated bookings require a reason (walk-in, cleanup, or historical record).", variant: "destructive" });
      return;
    }
    const composedNotes = isBackdated
      ? `[BACKDATED — ${backdateReason.trim()}]${data.notes ? `\n${data.notes}` : ""}`
      : (data.notes || null);
    try {
      await createBooking.mutateAsync({ unit_id: data.unit_id, check_in: data.check_in, check_out: data.check_out, num_guests: Number(data.num_guests), notes: composedNotes, guest_id: data.guest_id || null, guest_type: data.guest_type || null, flight_number: data.flight_number?.trim() || null, manual_guest_name: data.manual_guest_name?.trim() || null, manual_guest_email: data.manual_guest_email?.trim() || null, manual_guest_phone: data.manual_guest_phone?.trim() || null, total_price: pricing.total > 0 ? pricing.total : null, state: "inquiry" } as any);
      toast({ title: t("bookingForm.bookingCreated"), description: t("bookingForm.bookingCreatedDesc") });
      reset(); setBackdateReason(""); onOpenChange(false);
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message?.includes("overlap") ? t("bookingForm.overlapError") : err.message, variant: "destructive" });
    }
  };


  const pricingSources = useMemo(() => {
    const sources = new Map<string, number>();
    pricing.nights.forEach((n) => { const key = n.source === "seasonal" ? `${n.source}:${n.ruleName}` : n.source; sources.set(key, (sources.get(key) ?? 0) + 1); });
    return Array.from(sources.entries()).map(([key, count]) => { const [source, name] = key.split(":"); return { source, name, count }; });
  }, [pricing.nights]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("bookingForm.newBooking")}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("bookingForm.unit")} *</Label>
            <Select value={selectedUnitId} onValueChange={(v) => setValue("unit_id", v)}>
              <SelectTrigger><SelectValue placeholder={t("bookingForm.selectUnit")} /></SelectTrigger>
              <SelectContent>{activeUnits.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}<span className="text-muted-foreground ml-1 text-xs">(max {u.capacity}, min {u.min_nights}n)</span></SelectItem>)}</SelectContent>
            </Select>
            <input type="hidden" {...register("unit_id", { required: true })} />
            {errors.unit_id && <p className="text-sm text-destructive">{t("bookingForm.unitRequired")}</p>}
          </div>
          <div className="space-y-2">
            <Label>{t("bookingForm.guestType", { defaultValue: "Guest Type" })}</Label>
            <Select value={watch("guest_type")} onValueChange={(v) => setValue("guest_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {guestTypeOptions.map((gt) => (
                  <SelectItem key={gt.value} value={gt.value}>{t(gt.labelKey)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label htmlFor="check_in">{t("bookingForm.checkIn")} *</Label><Input id="check_in" type="date" {...register("check_in", { required: true })} />{errors.check_in && <p className="text-sm text-destructive">{t("common.required")}</p>}</div>
            <div className="space-y-2"><Label htmlFor="check_out">{t("bookingForm.checkOut")} *</Label><Input id="check_out" type="date" {...register("check_out", { required: true })} />{errors.check_out && <p className="text-sm text-destructive">{t("common.required")}</p>}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label htmlFor="num_guests">{t("bookingForm.numGuests")}</Label><Input id="num_guests" type="number" min={1} max={selectedUnit?.capacity ?? 99} {...register("num_guests")} /></div>
            {selectedUnit && (selectedUnit as any).max_extra_beds > 0 && (
              <div className="space-y-2">
                <Label htmlFor="extra_beds">Extra Beds</Label>
                <Input id="extra_beds" type="number" min={0} max={(selectedUnit as any).max_extra_beds} {...register("extra_beds")} />
                <p className="text-xs text-muted-foreground">{formatPrice(Number((selectedUnit as any).extra_bed_fee) || 0, policies)}/bed/night (max {(selectedUnit as any).max_extra_beds})</p>
              </div>
            )}
          </div>
          {isBackdated && (
            <div className="rounded-md border border-warning/60 bg-warning/10 p-3 space-y-2">
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-warning-foreground" />
                <span className="text-warning-foreground">
                  {canBackdate
                    ? "This booking starts in the past. Only continue for cleanup, historical records, or walk-ins recorded after the fact. A reason is required and will be logged."
                    : "This check-in date is in the past. Only a manager or front-desk supervisor can record a backdated booking — please have a supervisor create it, or set the check-in date to today or later."}
                </span>
              </div>
              {canBackdate && (
                <div className="space-y-1">
                  <Label htmlFor="backdate_reason" className="text-xs">Backdate reason *</Label>
                  <Input id="backdate_reason" value={backdateReason} onChange={(e) => setBackdateReason(e.target.value)} placeholder="e.g. Walk-in recorded after checkout / historical cleanup" />
                </div>
              )}
            </div>
          )}

          {validationErrors.length > 0 && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 space-y-1">{validationErrors.map((err, i) => <div key={i} className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{err}</span></div>)}</div>
          )}
          {bufferWarning && validationErrors.length === 0 && (
            <div className="rounded-md border border-warning/50 bg-warning/5 p-3"><div className="flex items-center gap-2 text-sm text-warning-foreground"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{bufferWarning}</span></div></div>
          )}
          {pricing.nights.length > 0 && validationErrors.length === 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <h4 className="text-sm font-semibold text-foreground">{t("bookingForm.priceBreakdown")}</h4>
              <div className="space-y-1">{pricingSources.map(({ source, name, count }, i) => <div key={i} className="flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Badge variant="outline" className="text-[10px] px-1.5 py-0">{t(`pricing.priceSources.${source}`)}</Badge>{name && <span>({name})</span>}<span>× {count} {count > 1 ? t("common.nights") : t("common.night")}</span></span></div>)}</div>
              <Separator />
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("bookingForm.subtotal")} ({pricing.nights.length} {pricing.nights.length > 1 ? t("common.nights") : t("common.night")})</span><span className="font-medium">{formatPrice(pricing.subtotal, policies)}</span></div>
              {pricing.cleaningFee > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("bookingForm.cleaningFee")}</span><span className="font-medium">{formatPrice(pricing.cleaningFee, policies)}</span></div>}
              {pricing.extraBedTotal > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Extra Beds ({extraBeds} × {pricing.nights.length} {pricing.nights.length > 1 ? t("common.nights") : t("common.night")})</span><span className="font-medium">{formatPrice(pricing.extraBedTotal, policies)}</span></div>}
              {pricing.longStayDiscount && (
                <div className="flex justify-between text-sm text-[hsl(var(--success))]">
                  <span>{t("pricing.longStayDiscount", { tier: pricing.longStayDiscount.tierLabel, pct: pricing.longStayDiscount.percentage })}</span>
                  <span className="font-medium">-{formatPrice(pricing.longStayDiscount.amount, policies)}</span>
                </div>
              )}
              {pricing.loyaltyDiscount && (
                <div className="flex justify-between text-sm text-[hsl(var(--success))]">
                  <span>{t("pricing.loyaltyDiscount", { tier: pricing.loyaltyDiscount.tierLabel, pct: pricing.loyaltyDiscount.percentage })}</span>
                  <span className="font-medium">-{formatPrice(pricing.loyaltyDiscount.amount, policies)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-sm font-semibold"><span>{t("common.total")}</span><span>{formatPrice(pricing.total, policies)}</span></div>
            </div>
          )}
          <div className="space-y-2">
            <Label>{t("bookingForm.guestOptional")}</Label>
            <Input placeholder={t("bookingForm.searchGuestPlaceholder")} value={guestSearch} onChange={(e) => setGuestSearch(e.target.value)} className="mb-1" />
            <Select value={selectedGuestId || "__none__"} onValueChange={(v) => setValue("guest_id", v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={t("bookingForm.selectGuest")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("bookingForm.noGuest")}</SelectItem>
                {filteredGuests.filter((p) => !!p.user_id).map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name ?? p.email ?? p.user_id}</SelectItem>)}
              </SelectContent>
            </Select>
            <input type="hidden" {...register("guest_id")} />
          </div>
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 space-y-3">
            <div>
              <p className="text-sm font-medium">Manual guest details (no account needed)</p>
              <p className="text-xs text-muted-foreground">Use for walk-ins, phone/OTA bookings, or pre-existing reservations. Shows on the booking card and calendar.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual_guest_name">Guest name</Label>
              <Input id="manual_guest_name" {...register("manual_guest_name")} placeholder="e.g. John Smith" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="manual_guest_email">Email (optional)</Label>
                <Input id="manual_guest_email" type="email" {...register("manual_guest_email")} placeholder="guest@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual_guest_phone">Phone (optional)</Label>
                <Input id="manual_guest_phone" {...register("manual_guest_phone")} placeholder="+66..." />
              </div>
            </div>
          </div>
          <div className="space-y-2"><Label htmlFor="flight_number">Flight number (optional)</Label><Input id="flight_number" {...register("flight_number")} placeholder="e.g. TG921" /></div>
          <div className="space-y-2"><Label htmlFor="notes">{t("bookingForm.notes")}</Label><Textarea id="notes" {...register("notes")} placeholder={t("bookingForm.notesPlaceholder")} rows={3} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={createBooking.isPending || validationErrors.length > 0}>{createBooking.isPending ? t("common.creating") : t("bookingForm.createInquiry")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
