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
import { fromCampInputValue } from "@/lib/timezone";
import { calculatePricing, type PricingSummary } from "@/lib/pricingCalculator";
import { formatPrice } from "@/lib/currency";
import { GUEST_MESSAGES, RETRYABLE_STATUSES } from "@/lib/availability/types";
import { AlertTriangle, CalendarPlus, Plane, CheckCircle2, XCircle, RefreshCw, Loader2 } from "lucide-react";

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
  connecting_flight: string;
  arrival_datetime: string;
  flights_not_booked: boolean;
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
      guest_type: "", notes: "", arrival_flight: "", connecting_flight: "",
      arrival_datetime: "", flights_not_booked: false,
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
  const arrivalFlight = watch("arrival_flight");
  const arrivalDatetime = watch("arrival_datetime");
  const flightsNotBooked = watch("flights_not_booked");

  const selectedGroup = unitGroups?.find((g) => g.id === selectedGroupId);

  useEffect(() => {
    if (!defaultUnitId || selectedGroupId || !unitGroups?.length) return;
    const matchingGroup = unitGroups.find((g) => g.unitIds?.includes(defaultUnitId));
    if (matchingGroup) setValue("group_id", matchingGroup.id);
  }, [defaultUnitId, selectedGroupId, unitGroups, setValue]);



  // Auto-assign: find available unit for group + dates.
  // Hook never throws — status lives on data.status. See src/lib/availability/types.ts.
  const { data: assignResult, isLoading: assignLoading, refetch: refetchAssign, isFetching: assignFetching } = useAutoAssignUnit(
    selectedGroupId || undefined,
    checkIn,
    checkOut
  );

  const availabilityStatus = assignResult?.status;
  const isAvailable = availabilityStatus === "available";
  const canRetryAvailability = !!availabilityStatus && RETRYABLE_STATUSES.includes(availabilityStatus);

  // Fire-and-forget consistency check — only on successful confirmed checks.
  useEffect(() => {
    if (!selectedGroupId || !checkIn || !checkOut || !assignResult) return;
    if (assignResult.status !== "available" && assignResult.status !== "unavailable") return;
    supabase.functions
      .invoke("availability-consistency-check", {
        body: {
          group_id: selectedGroupId,
          check_in: checkIn,
          check_out: checkOut,
          source: "guest_booking_form",
        },
      })
      .catch(() => {/* silent — this is diagnostic only */});
  }, [selectedGroupId, checkIn, checkOut, assignResult]);


  // Build a "fake" unit object for pricing calculation from the group representative
  const pricingUnit = useMemo(() => {
    if (!selectedGroup) return null;
    return {
      id: selectedGroup.representativeUnitId ?? "",
      // Needed so room-type (group) seasonal rules resolve for guest quotes.
      group_id: selectedGroup.id,
      name: selectedGroup.name,

      base_price: selectedGroup.base_price,
      capacity: selectedGroup.capacity,
      min_nights: selectedGroup.min_nights,
      cleaning_fee: selectedGroup.cleaning_fee,
      weekend_price: selectedGroup.weekend_price,
      pricing_type: (selectedGroup as any).pricing_type ?? "per_room",
      min_billable_guests: (selectedGroup as any).min_billable_guests ?? null,
      weekly_rate: null,
      monthly_rate: null,
      max_extra_beds: 0,
      extra_bed_fee: 0,
    };
  }, [selectedGroup]);

  const pricing: PricingSummary = useMemo(() => {
    if (!pricingUnit || !checkIn || !checkOut) return { nights: [], subtotal: 0, cleaningFee: 0, extraBedTotal: 0, longStayDiscount: null, loyaltyDiscount: null, total: 0 };
    return calculatePricing(pricingUnit as any, checkIn, checkOut, allPricingRules ?? [], undefined, policies, undefined, 0, Number(numGuests) || 1);
  }, [pricingUnit, checkIn, checkOut, allPricingRules, policies, numGuests]);


  // Pricing is unavailable if we have nights to price but total is zero
  // (no seasonal rule covers the range AND base_price is 0/missing).
  const pricingUnavailable = useMemo(() => {
    if (!pricingUnit || !checkIn || !checkOut) return false;
    const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
    if (nights <= 0) return false;
    return pricing.nights.length > 0 && pricing.subtotal <= 0;
  }, [pricingUnit, checkIn, checkOut, pricing]);

  // Travel protocol: every stay request must answer the flight question.
  // Guests without tickets yet tick "not booked" and the booking is flagged
  // so staff chase the details before arrival.
  const travelErrors = useMemo(() => {
    const errs: string[] = [];
    if (flightsNotBooked) return errs;
    if (!arrivalFlight?.trim()) {
      errs.push(t("guestBooking.flightRequired", {
        defaultValue: "Please add the flight you land on — or tick that your flights aren't booked yet.",
      }));
    }
    if (!arrivalDatetime) {
      errs.push(t("guestBooking.arrivalTimeRequired", {
        defaultValue: "Please add your arrival date and time in Thailand.",
      }));
    }
    return errs;
  }, [flightsNotBooked, arrivalFlight, arrivalDatetime, t]);

  const validationErrors = useMemo(() => {
    const errs: string[] = [...travelErrors];
    if (!selectedGroup || !checkIn || !checkOut) return errs;
    const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
    if (nights <= 0) errs.push(t("bookingForm.checkoutAfterCheckin"));
    else if (nights < selectedGroup.min_nights) errs.push(t("bookingForm.minStay", { count: selectedGroup.min_nights }));
    if (Number(numGuests) > selectedGroup.capacity) errs.push(t("bookingForm.maxCapacity", { count: selectedGroup.capacity }));

    // Availability — only surface as an error once the check completes.
    // Transient failures do NOT get an inventory-flavored message.
    if (availabilityStatus === "unavailable") {
      errs.push(GUEST_MESSAGES.unavailable);
    } else if (availabilityStatus === "configuration_error") {
      errs.push(GUEST_MESSAGES.configuration_error);
    }
    // network/server/unknown errors are surfaced separately with a Try Again
    // button — not stuffed into the validation-errors list.

    if (pricingUnavailable) {
      errs.push(GUEST_MESSAGES.pricing_unavailable);
    }
    return errs;
  }, [travelErrors, selectedGroup, checkIn, checkOut, numGuests, availabilityStatus, pricingUnavailable, t]);

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

  const todayBkk = useMemo(
    () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()),
    []
  );

  const onSubmit = async (data: FormValues) => {
    if (validationErrors.length > 0 || !user || !selectedGroupId) return;

    // Guard: guests cannot request past dates (Asia/Bangkok).
    if (data.check_in && data.check_in < todayBkk) {
      toast({
        title: t("common.error"),
        description: "Check-in date cannot be in the past. Please choose today or a future date.",
        variant: "destructive",
      });
      return;
    }


    const arrivalDetails: Record<string, any> = {};
    if (data.arrival_flight) arrivalDetails.flight_info = data.arrival_flight;
    if (data.connecting_flight) arrivalDetails.connecting_flight = data.connecting_flight;
    if (data.arrival_datetime) {
      arrivalDetails.arrival_datetime = fromCampInputValue(data.arrival_datetime);
      arrivalDetails.arrival_time = data.arrival_datetime.slice(11, 16);
    }
    arrivalDetails.flight_pending = !!data.flights_not_booked;
    if (data.emergency_contact) arrivalDetails.emergency_contact = data.emergency_contact;
    if (data.airport_pickup) arrivalDetails.airport_pickup = true;

    try {
      // Atomic re-pick at submit time. The advisory `assignResult` read by
      // useAutoAssignUnit can be stale or shared with another concurrent
      // guest; calling the RPC again here gives us the freshest row under
      // FOR UPDATE SKIP LOCKED right before the insert.
      const { data: assignRows, error: assignErr } = await (supabase as any).rpc(
        "assign_unit_for_group",
        { _group_id: selectedGroupId, _check_in: data.check_in, _check_out: data.check_out }
      );
      if (assignErr) throw assignErr;
      const assigned = Array.isArray(assignRows) ? assignRows[0] : assignRows;
      const assignedUnitId = assigned?.unit_id as string | null | undefined;
      if (!assignedUnitId) {
        toast({
          title: t("common.error"),
          description: t("bookingForm.noRoomsAvailable", {
            defaultValue: "Sorry — that room type is no longer available for those dates.",
          }),
          variant: "destructive",
        });
        return;
      }

      const bookingResult = await createBooking.mutateAsync({
        unit_id: assignedUnitId,
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
          arrival_datetime: fromCampInputValue(data.pickup_arrival_datetime),
          passenger_count: Number(data.pickup_passenger_count) || 1,
          luggage_notes: data.pickup_luggage_notes || null,
          special_instructions: data.pickup_special_instructions || null,
        } as any);
      }

      toast({ title: t("guestBooking.requestSent"), description: t("guestBooking.requestSentDesc") });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      const friendly = err.message?.includes("overlap")
        ? t("bookingForm.overlapError", {
            defaultValue: "Sorry — that room type was just taken for those dates. Please pick another date or room.",
          })
        : err.message;
      toast({ title: t("common.error"), description: friendly, variant: "destructive" });
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
            <Select value={selectedGroupId || undefined} onValueChange={(v) => setValue("group_id", v)}>
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
              <Input id="guest_check_in" type="date" min={todayBkk} {...register("check_in", { required: true })} />
              {errors.check_in && <p className="text-sm text-destructive">{t("common.required")}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest_check_out">{t("bookingForm.checkOut")} *</Label>
              <Input id="guest_check_out" type="date" min={todayBkk} {...register("check_out", { required: true })} />

              {errors.check_out && <p className="text-sm text-destructive">{t("common.required")}</p>}
            </div>
          </div>

          {/* Availability indicator — one message per classified status. */}
          {selectedGroupId && checkIn && checkOut && (
            <>
              <div className={`flex items-center gap-2 text-sm rounded-md border p-2 ${
                assignLoading || assignFetching ? "border-border bg-muted/30 text-muted-foreground" :
                availabilityStatus === "available" ? "border-success/50 bg-success/5 text-success" :
                availabilityStatus === "unavailable" ? "border-destructive/50 bg-destructive/5 text-destructive" :
                canRetryAvailability ? "border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-400" :
                "border-destructive/50 bg-destructive/5 text-destructive"
              }`}>
                {assignLoading || assignFetching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t("common.checking", { defaultValue: "Checking availability..." })}</span>
                  </>
                ) : availabilityStatus === "available" ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{assignResult?.available_count} of {assignResult?.total_count} {t("bookingForm.roomsAvailable", { defaultValue: "rooms available" })}</span>
                  </>
                ) : availabilityStatus === "unavailable" ? (
                  <>
                    <XCircle className="h-4 w-4" />
                    <span>{GUEST_MESSAGES.unavailable}</span>
                  </>
                ) : availabilityStatus ? (
                  <>
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{GUEST_MESSAGES[availabilityStatus]}</span>
                  </>
                ) : null}
              </div>
              {canRetryAvailability && !assignLoading && !assignFetching && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => refetchAssign()}
                >
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                  {t("common.tryAgain", { defaultValue: "Try Again" })}
                </Button>
              )}
            </>
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
              {pricing.billableGuests != null && pricing.actualGuests != null && pricing.billableGuests > pricing.actualGuests && (
                <p className="text-xs text-muted-foreground italic">
                  {t("pricing.minBillableNote", {
                    count: pricing.billableGuests,
                    defaultValue: "Pricing is based on a {{count}}-person minimum charge.",
                  })}

                </p>
              )}
            </div>
          )}


          <GuestTypeSelect value={watch("guest_type")} onChange={(v) => setValue("guest_type", v)} />

          <Separator />
          <h4 className="text-sm font-semibold text-foreground">{t("guestBooking.arrivalDetails")}</h4>

          <div className="rounded-md border border-border p-3 space-y-3">
            <div className="flex items-start gap-2">
              <Plane className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                {t("guestBooking.flightProtocolNote", {
                  defaultValue:
                    "Flight details are required for every stay so we can follow your journey and reach you if anything changes.",
                })}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="arrival_flight">
                  {t("guestBooking.finalFlight", { defaultValue: "Flight you land on" })}
                  {!flightsNotBooked && <span className="text-destructive"> *</span>}
                </Label>
                <Input
                  id="arrival_flight"
                  {...register("arrival_flight")}
                  disabled={flightsNotBooked}
                  placeholder="PG 123"
                  className="uppercase"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="arrival_datetime">
                  {t("guestBooking.arrivalDateTime", { defaultValue: "Arrival date & time (Thailand)" })}
                  {!flightsNotBooked && <span className="text-destructive"> *</span>}
                </Label>
                <Input
                  id="arrival_datetime"
                  type="datetime-local"
                  {...register("arrival_datetime")}
                  disabled={flightsNotBooked}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="connecting_flight">
                {t("guestBooking.connectingFlight", { defaultValue: "Connecting / first flight (if any)" })}
              </Label>
              <Input
                id="connecting_flight"
                {...register("connecting_flight")}
                disabled={flightsNotBooked}
                placeholder="TG 925 Bangkok"
                className="uppercase"
              />
              <p className="text-[11px] text-muted-foreground">
                {t("guestBooking.connectingFlightHint", {
                  defaultValue: "Flying in through Bangkok or another city? Add that flight too.",
                })}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/50">
              <div>
                <Label htmlFor="flights_not_booked" className="text-sm font-medium">
                  {t("guestBooking.flightsNotBooked", { defaultValue: "My flights aren't booked yet" })}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("guestBooking.flightsNotBookedDesc", {
                    defaultValue: "We'll ask you for them on your stay page once you've booked.",
                  })}
                </p>
              </div>
              <Switch
                id="flights_not_booked"
                checked={flightsNotBooked}
                onCheckedChange={(v) => setValue("flights_not_booked", v)}
              />
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
                  <p className="text-xs text-muted-foreground">{t("guestBooking.airportPickupFeeNote", { defaultValue: "A transfer fee is added to your booking total." })}</p>

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
                    <Label className="text-xs">Arrival Date &amp; Time (Thailand time)</Label>
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
              disabled={createBooking.isPending || validationErrors.length > 0 || !isAvailable || assignLoading || assignFetching}
            >
              {createBooking.isPending ? t("common.sending") : t("guestBooking.submitRequest")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Property-contextual guest type selector */
function GuestTypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();

  // Fetch properties to determine operational mode — for guests we show all unique modes' types
  const { data: properties } = useQuery({
    queryKey: ["properties-modes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("operational_mode").eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const modes = useMemo(() => {
    const set = new Set((properties ?? []).map((p) => p.operational_mode));
    return Array.from(set);
  }, [properties]);

  // Merge guest types from all active property modes, deduplicated
  const guestTypes = useMemo(() => {
    const seen = new Set<string>();
    const result: { value: string; labelKey: string }[] = [];
    for (const mode of modes.length > 0 ? modes : ["high_turnover"]) {
      for (const gt of getGuestTypesForMode(mode)) {
        if (!seen.has(gt.value)) {
          seen.add(gt.value);
          result.push(gt);
        }
      }
    }
    return result;
  }, [modes]);

  // Set default when value is empty
  useEffect(() => {
    if (!value && guestTypes.length > 0) {
      const defaultMode = modes.includes("long_stay") ? "long_stay" : "high_turnover";
      onChange(DEFAULT_GUEST_TYPE[defaultMode] ?? guestTypes[0].value);
    }
  }, [value, guestTypes, modes, onChange]);

  return (
    <div className="space-y-2">
      <Label>{t("guestBooking.guestType")}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {guestTypes.map((gt) => (
            <SelectItem key={gt.value} value={gt.value}>
              {t(gt.labelKey, { defaultValue: gt.value })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
