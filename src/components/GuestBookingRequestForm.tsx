import { useState, useMemo, useEffect } from "react";
import { getGuestTypesForMode, DEFAULT_GUEST_TYPE } from "@/lib/guestTypes";
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
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCreateBooking } from "@/hooks/useBookings";
import { usePricingRules } from "@/hooks/usePricingRules";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { useAuth } from "@/hooks/useAuth";
import { useUnitGroups, useAutoAssignUnit } from "@/hooks/useAutoAssignUnit";
import { supabase } from "@/integrations/supabase/client";
import { calculatePricing, type PricingSummary } from "@/lib/pricingCalculator";
import { formatPrice } from "@/lib/currency";
import { AlertTriangle, CalendarPlus, Plane, CheckCircle2, XCircle } from "lucide-react";

interface GuestBookingRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultUnitId?: string;
}

interface FormValues {
  group_id: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  guest_type: string;
  notes: string;
  arrival_flight: string;
  arrival_time: string;
  emergency_contact: string;
  airport_pickup: boolean;
  pickup_flight_number: string;
  pickup_arrival_datetime: string;
  pickup_passenger_count: number;
  pickup_luggage_notes: string;
  pickup_special_instructions: string;
}

export function GuestBookingRequestForm({ open, onOpenChange, defaultUnitId }: GuestBookingRequestFormProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const createBooking = useCreateBooking();
  const { data: unitGroups } = useUnitGroups();
  const { data: allPricingRules } = usePricingRules();
  const { data: policies } = usePolicySettings();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      group_id: "", check_in: "", check_out: "", num_guests: 1,
      guest_type: "", notes: "", arrival_flight: "", arrival_time: "",
      emergency_contact: "", airport_pickup: false, pickup_flight_number: "",
      pickup_arrival_datetime: "", pickup_passenger_count: 1, pickup_luggage_notes: "",
      pickup_special_instructions: "",
    },
  });

  const selectedGroupId = watch("group_id");
  const checkIn = watch("check_in");
  const checkOut = watch("check_out");
  const numGuests = watch("num_guests");
  const airportPickup = watch("airport_pickup");

  const selectedGroup = unitGroups?.find((g) => g.id === selectedGroupId);

  // Auto-assign: find available unit for group + dates
  const { data: assignResult, isLoading: assignLoading } = useAutoAssignUnit(
    selectedGroupId || undefined,
    checkIn,
    checkOut
  );

  // Build a "fake" unit object for pricing calculation from the group representative
  const pricingUnit = useMemo(() => {
    if (!selectedGroup) return null;
    return {
      id: selectedGroup.representativeUnitId ?? "",
      name: selectedGroup.name,
      base_price: selectedGroup.base_price,
      capacity: selectedGroup.capacity,
      min_nights: selectedGroup.min_nights,
      cleaning_fee: selectedGroup.cleaning_fee,
      weekend_price: selectedGroup.weekend_price,
      pricing_type: "per_room" as const,
      weekly_rate: null,
      monthly_rate: null,
      max_extra_beds: 0,
      extra_bed_fee: 0,
    };
  }, [selectedGroup]);

  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    if (!selectedGroup || !checkIn || !checkOut) return errs;
    const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
    if (nights <= 0) errs.push(t("bookingForm.checkoutAfterCheckin"));
    else if (nights < selectedGroup.min_nights) errs.push(t("bookingForm.minStay", { count: selectedGroup.min_nights }));
    if (Number(numGuests) > selectedGroup.capacity) errs.push(t("bookingForm.maxCapacity", { count: selectedGroup.capacity }));
    // Check availability result
    if (assignResult && !assignResult.available) {
      errs.push(t("bookingForm.noAvailability", { defaultValue: "No rooms of this type are available for the selected dates" }));
    }
    return errs;
  }, [selectedGroup, checkIn, checkOut, numGuests, assignResult, t]);

  const pricing: PricingSummary = useMemo(() => {
    if (!pricingUnit || !checkIn || !checkOut || validationErrors.length > 0) return { nights: [], subtotal: 0, cleaningFee: 0, extraBedTotal: 0, longStayDiscount: null, loyaltyDiscount: null, total: 0 };
    return calculatePricing(pricingUnit as any, checkIn, checkOut, allPricingRules ?? [], undefined, policies);
  }, [pricingUnit, checkIn, checkOut, allPricingRules, validationErrors, policies]);

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
    if (validationErrors.length > 0 || !user || !assignResult?.unit_id) return;

    const arrivalDetails: Record<string, any> = {};
    if (data.arrival_flight) arrivalDetails.flight_info = data.arrival_flight;
    if (data.arrival_time) arrivalDetails.arrival_time = data.arrival_time;
    if (data.emergency_contact) arrivalDetails.emergency_contact = data.emergency_contact;
    if (data.airport_pickup) arrivalDetails.airport_pickup = true;

    try {
      const bookingResult = await createBooking.mutateAsync({
        unit_id: assignResult.unit_id, // Auto-assigned unit
        check_in: data.check_in,
        check_out: data.check_out,
        num_guests: Number(data.num_guests),
        notes: data.notes || null,
        guest_id: user.id,
        guest_type: data.guest_type,
        total_price: pricing.total > 0 ? pricing.total : null,
        arrival_details: Object.keys(arrivalDetails).length > 0 ? arrivalDetails : null,
        state: "inquiry",
      });

      // Create airport pickup record if requested
      if (data.airport_pickup && bookingResult?.id) {
        const transportFee = policies?.find((p) => p.key === "transport_base_fee");
        const feeType = policies?.find((p) => p.key === "transport_fee_type");
        const baseFee = transportFee ? Number(transportFee.value) : 500;
        const fee = String(feeType?.value).replace(/"/g, "") === "per_person"
          ? baseFee * Number(data.pickup_passenger_count || 1)
          : baseFee;

        await supabase.from("airport_pickups" as any).insert({
          booking_id: bookingResult.id,
          status: "requested",
          fee,
          flight_number: data.pickup_flight_number || null,
          arrival_datetime: data.pickup_arrival_datetime || null,
          passenger_count: Number(data.pickup_passenger_count) || 1,
          luggage_notes: data.pickup_luggage_notes || null,
          special_instructions: data.pickup_special_instructions || null,
        } as any);
      }

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
          {/* Room Type Selection */}
          <div className="space-y-2">
            <Label>{t("bookingForm.roomType", { defaultValue: "Room Type" })} *</Label>
            <Select value={selectedGroupId} onValueChange={(v) => setValue("group_id", v)}>
              <SelectTrigger><SelectValue placeholder={t("bookingForm.selectRoomType", { defaultValue: "Select room type" })} /></SelectTrigger>
              <SelectContent>
                {unitGroups?.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                    <span className="text-muted-foreground ml-1 text-xs">
                      ({g.unitCount} {g.unitCount === 1 ? "room" : "rooms"}, max {g.capacity})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" {...register("group_id", { required: true })} />
            {errors.group_id && <p className="text-sm text-destructive">{t("bookingForm.unitRequired")}</p>}
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

          {/* Availability indicator */}
          {selectedGroupId && checkIn && checkOut && (
            <div className={`flex items-center gap-2 text-sm rounded-md border p-2 ${
              assignLoading ? "border-border bg-muted/30 text-muted-foreground" :
              assignResult?.available ? "border-success/50 bg-success/5 text-success" :
              "border-destructive/50 bg-destructive/5 text-destructive"
            }`}>
              {assignLoading ? (
                <span>{t("common.checking", { defaultValue: "Checking availability..." })}</span>
              ) : assignResult?.available ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{assignResult.available_count} of {assignResult.total_count} {t("bookingForm.roomsAvailable", { defaultValue: "rooms available" })}</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  <span>{t("bookingForm.noRoomsAvailable", { defaultValue: "No rooms available for these dates" })}</span>
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="guest_num_guests">{t("bookingForm.numGuests")}</Label>
            <Input id="guest_num_guests" type="number" min={1} max={selectedGroup?.capacity ?? 99} {...register("num_guests")} />
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

          <Separator />
          <h4 className="text-sm font-semibold text-foreground">{t("guestBooking.arrivalDetails")}</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="arrival_flight">{t("guestBooking.flightInfo")}</Label>
              <Input id="arrival_flight" {...register("arrival_flight")} placeholder={t("guestBooking.flightPlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arrival_time">{t("guestBooking.arrivalTime")}</Label>
              <Input id="arrival_time" type="time" {...register("arrival_time")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="emergency_contact">{t("guestBooking.emergencyContact")}</Label>
            <Input id="emergency_contact" {...register("emergency_contact")} placeholder={t("guestBooking.emergencyPlaceholder")} />
          </div>

          {/* Airport pickup option */}
          <div className="rounded-md border border-border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plane className="h-4 w-4 text-primary" />
                <div>
                  <Label htmlFor="airport_pickup" className="text-sm font-medium">{t("guestBooking.airportPickup", { defaultValue: "Arrange Airport Pickup" })}</Label>
                  <p className="text-xs text-muted-foreground">{t("guestBooking.airportPickupDesc", { defaultValue: "We'll arrange a pickup from the airport for you" })}</p>
                </div>
              </div>
              <Switch id="airport_pickup" checked={airportPickup} onCheckedChange={(v) => setValue("airport_pickup", v)} />
            </div>

            {airportPickup && (
              <div className="space-y-3 pt-1 border-t border-border/50">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Flight Number</Label>
                    <Input {...register("pickup_flight_number")} placeholder="TG 925" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Arrival Date & Time</Label>
                    <Input type="datetime-local" {...register("pickup_arrival_datetime")} className="h-8 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Passengers</Label>
                    <Input type="number" min={1} {...register("pickup_passenger_count")} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Luggage Notes</Label>
                    <Input {...register("pickup_luggage_notes")} placeholder="2 bags" className="h-8 text-sm" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Special Instructions</Label>
                  <Input {...register("pickup_special_instructions")} placeholder="Wheelchair assistance, etc." className="h-8 text-sm" />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="guest_notes">{t("bookingForm.notes")}</Label>
            <Textarea id="guest_notes" {...register("notes")} placeholder={t("guestBooking.notesPlaceholder")} rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button
              type="submit"
              disabled={createBooking.isPending || validationErrors.length > 0 || !assignResult?.available || assignLoading}
            >
              {createBooking.isPending ? t("common.sending") : t("guestBooking.submitRequest")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
