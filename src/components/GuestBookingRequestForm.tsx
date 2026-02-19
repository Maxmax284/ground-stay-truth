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
import { supabase } from "@/integrations/supabase/client";
import { calculatePricing, type PricingSummary } from "@/lib/pricingCalculator";
import { formatPrice } from "@/lib/currency";
import { AlertTriangle, CalendarPlus } from "lucide-react";

interface GuestBookingRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultUnitId?: string;
}

interface FormValues {
  unit_id: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  guest_type: string;
  notes: string;
}

export function GuestBookingRequestForm({ open, onOpenChange, defaultUnitId }: GuestBookingRequestFormProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const createBooking = useCreateBooking();
  const { data: units } = useUnits();
  const { data: allPricingRules } = usePricingRules();
  const { data: policies } = usePolicySettings();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: { unit_id: defaultUnitId ?? "", check_in: "", check_out: "", num_guests: 1, guest_type: "training_guest", notes: "" },
  });

  const selectedUnitId = watch("unit_id");
  const checkIn = watch("check_in");
  const checkOut = watch("check_out");
  const numGuests = watch("num_guests");
  const activeUnits = units?.filter((u) => u.is_active) ?? [];
  const selectedUnit = activeUnits.find((u) => u.id === selectedUnitId);

  const { data: maintenanceBlocks } = useMaintenanceBlocks({ unitId: selectedUnitId || undefined, dateFrom: checkIn || undefined, dateTo: checkOut || undefined });
  const existingBookings = useQuery({
    queryKey: ["unit-bookings-for-validation", selectedUnitId, checkIn, checkOut],
    enabled: !!selectedUnitId && !!checkIn && !!checkOut,
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("id, check_in, check_out, state").eq("unit_id", selectedUnitId).not("state", "in", '("cancelled","no_show")').gte("check_out", checkIn).lte("check_in", checkOut);
      if (error) throw error;
      return data;
    },
  });

  const cleaningBufferHours = useMemo(() => {
    const setting = policies?.find((p) => p.key === "cleaning_buffer_hours");
    return setting ? Number(setting.value) : 4;
  }, [policies]);

  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    if (!selectedUnit || !checkIn || !checkOut) return errs;
    const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
    if (nights <= 0) errs.push(t("bookingForm.checkoutAfterCheckin"));
    else if (nights < selectedUnit.min_nights) errs.push(t("bookingForm.minStay", { count: selectedUnit.min_nights }));
    if (Number(numGuests) > selectedUnit.capacity) errs.push(t("bookingForm.maxCapacity", { count: selectedUnit.capacity }));
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
          errs.push(t("bookingForm.bufferConflict", { hours: cleaningBufferHours, date: existing.check_out }));
          break;
        }
      }
    }
    return errs;
  }, [selectedUnit, checkIn, checkOut, numGuests, maintenanceBlocks, existingBookings.data, cleaningBufferHours, t]);

  const pricing: PricingSummary = useMemo(() => {
    if (!selectedUnit || !checkIn || !checkOut || validationErrors.length > 0) return { nights: [], subtotal: 0, cleaningFee: 0, total: 0 };
    return calculatePricing(selectedUnit, checkIn, checkOut, allPricingRules ?? []);
  }, [selectedUnit, checkIn, checkOut, allPricingRules, validationErrors]);

  const pricingSources = useMemo(() => {
    const sources = new Map<string, number>();
    pricing.nights.forEach((n) => {
      const key = n.source === "seasonal" ? `${n.source}:${n.ruleName}` : n.source;
      sources.set(key, (sources.get(key) ?? 0) + 1);
    });
    return Array.from(sources.entries()).map(([key, count]) => {
      const [source, name] = key.split(":");
      return { source, name, count };
    });
  }, [pricing.nights]);

  const onSubmit = async (data: FormValues) => {
    if (validationErrors.length > 0 || !user) return;
    try {
      await createBooking.mutateAsync({
        unit_id: data.unit_id,
        check_in: data.check_in,
        check_out: data.check_out,
        num_guests: Number(data.num_guests),
        notes: data.notes || null,
        guest_id: user.id,
        total_price: pricing.total > 0 ? pricing.total : null,
        state: "inquiry",
      });
      toast({ title: t("guestBooking.requestSent"), description: t("guestBooking.requestSentDesc") });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message?.includes("overlap") ? t("bookingForm.overlapError") : err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            {t("guestBooking.requestBooking")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("bookingForm.unit")} *</Label>
            <Select value={selectedUnitId} onValueChange={(v) => setValue("unit_id", v)}>
              <SelectTrigger><SelectValue placeholder={t("bookingForm.selectUnit")} /></SelectTrigger>
              <SelectContent>
                {activeUnits.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                    <span className="text-muted-foreground ml-1 text-xs">(max {u.capacity}, min {u.min_nights}n)</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" {...register("unit_id", { required: true })} />
            {errors.unit_id && <p className="text-sm text-destructive">{t("bookingForm.unitRequired")}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="guest_check_in">{t("bookingForm.checkIn")} *</Label>
              <Input id="guest_check_in" type="date" {...register("check_in", { required: true })} />
              {errors.check_in && <p className="text-sm text-destructive">{t("common.required")}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest_check_out">{t("bookingForm.checkOut")} *</Label>
              <Input id="guest_check_out" type="date" {...register("check_out", { required: true })} />
              {errors.check_out && <p className="text-sm text-destructive">{t("common.required")}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="guest_num_guests">{t("bookingForm.numGuests")}</Label>
            <Input id="guest_num_guests" type="number" min={1} max={selectedUnit?.capacity ?? 99} {...register("num_guests")} />
          </div>

          {validationErrors.length > 0 && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 space-y-1">
              {validationErrors.map((err, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}

          {pricing.nights.length > 0 && validationErrors.length === 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <h4 className="text-sm font-semibold text-foreground">{t("bookingForm.priceBreakdown")}</h4>
              <div className="space-y-1">
                {pricingSources.map(({ source, name, count }, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t(`pricing.priceSources.${source}`)}</Badge>
                      {name && <span>({name})</span>}
                      <span>× {count} {count > 1 ? t("common.nights") : t("common.night")}</span>
                    </span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("bookingForm.subtotal")} ({pricing.nights.length} {pricing.nights.length > 1 ? t("common.nights") : t("common.night")})</span>
                <span className="font-medium">{formatPrice(pricing.subtotal, policies)}</span>
              </div>
              {pricing.cleaningFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("bookingForm.cleaningFee")}</span>
                  <span className="font-medium">{formatPrice(pricing.cleaningFee, policies)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-sm font-semibold">
                <span>{t("common.total")}</span>
                <span>{formatPrice(pricing.total, policies)}</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("guestBooking.guestType")}</Label>
            <Select value={watch("guest_type")} onValueChange={(v) => setValue("guest_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fighter">{t("guestBooking.guestTypes.fighter")}</SelectItem>
                <SelectItem value="training_guest">{t("guestBooking.guestTypes.training_guest")}</SelectItem>
                <SelectItem value="spectator">{t("guestBooking.guestTypes.spectator")}</SelectItem>
                <SelectItem value="long_term">{t("guestBooking.guestTypes.long_term")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="guest_notes">{t("bookingForm.notes")}</Label>
            <Textarea id="guest_notes" {...register("notes")} placeholder={t("guestBooking.notesPlaceholder")} rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={createBooking.isPending || validationErrors.length > 0}>
              {createBooking.isPending ? t("common.sending") : t("guestBooking.submitRequest")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
