import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, addHours, isWithinInterval, startOfDay, parseISO } from "date-fns";
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
import { permissions } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { calculatePricing, type PricingSummary } from "@/lib/pricingCalculator";
import { AlertTriangle } from "lucide-react";

interface BookingFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultUnitId?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
}

interface FormValues {
  unit_id: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  notes: string;
  guest_id: string;
}

const SOURCE_LABELS: Record<string, string> = {
  override: "Manual Override",
  seasonal: "Seasonal",
  weekend: "Weekend",
  base: "Base Rate",
};

export function BookingFormDialog({
  open,
  onOpenChange,
  defaultUnitId,
  defaultCheckIn,
  defaultCheckOut,
}: BookingFormDialogProps) {
  const { toast } = useToast();
  const { role } = useAuth();
  const createBooking = useCreateBooking();
  const { data: units } = useUnits();
  const { data: allPricingRules } = usePricingRules();
  const { data: policies } = usePolicySettings();
  const [guestSearch, setGuestSearch] = useState("");

  const guestProfiles = useQuery({
    queryKey: ["guest-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const filteredGuests = (guestProfiles.data ?? []).filter((p) => {
    if (!guestSearch) return true;
    const q = guestSearch.toLowerCase();
    return (p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q));
  });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      unit_id: defaultUnitId ?? "",
      check_in: defaultCheckIn ?? "",
      check_out: defaultCheckOut ?? "",
      num_guests: 1,
      notes: "",
      guest_id: "",
    },
  });

  const selectedUnitId = watch("unit_id");
  const selectedGuestId = watch("guest_id");
  const checkIn = watch("check_in");
  const checkOut = watch("check_out");
  const numGuests = watch("num_guests");

  const activeUnits = units?.filter((u) => u.is_active) ?? [];
  const selectedUnit = activeUnits.find((u) => u.id === selectedUnitId);

  // Fetch maintenance blocks for the selected unit
  const { data: maintenanceBlocks } = useMaintenanceBlocks({
    unitId: selectedUnitId || undefined,
    dateFrom: checkIn || undefined,
    dateTo: checkOut || undefined,
  });

  // Fetch existing bookings for the selected unit to check cleaning buffer
  const existingBookings = useQuery({
    queryKey: ["unit-bookings-for-validation", selectedUnitId, checkIn, checkOut],
    enabled: !!selectedUnitId && !!checkIn && !!checkOut,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, check_in, check_out, state")
        .eq("unit_id", selectedUnitId)
        .not("state", "in", '("cancelled","no_show")')
        .gte("check_out", checkIn)
        .lte("check_in", checkOut);
      if (error) throw error;
      return data;
    },
  });

  const cleaningBufferHours = useMemo(() => {
    const setting = policies?.find((p) => p.key === "cleaning_buffer_hours");
    return setting ? Number(setting.value) : 4;
  }, [policies]);

  const isAdminRole = permissions.canAdminOverride(role);

  // Validation checks
  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    if (!selectedUnit || !checkIn || !checkOut) return errs;

    const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));

    if (nights <= 0) {
      errs.push("Check-out must be after check-in.");
    } else if (nights < selectedUnit.min_nights) {
      errs.push(`Minimum stay is ${selectedUnit.min_nights} night${selectedUnit.min_nights > 1 ? "s" : ""} for this unit.`);
    }

    if (Number(numGuests) > selectedUnit.capacity) {
      errs.push(`Maximum capacity is ${selectedUnit.capacity} guest${selectedUnit.capacity > 1 ? "s" : ""} for this unit.`);
    }

    // Check maintenance block overlaps
    if (maintenanceBlocks?.length) {
      for (const block of maintenanceBlocks) {
        if (block.start_date <= checkOut && block.end_date >= checkIn) {
          errs.push(`Unit is blocked for maintenance from ${block.start_date} to ${block.end_date}${block.reason ? ` (${block.reason})` : ""}.`);
          break;
        }
      }
    }

    // Check cleaning buffer conflicts
    if (existingBookings.data?.length && cleaningBufferHours > 0) {
      for (const existing of existingBookings.data) {
        // Check if our check-in falls within the cleaning buffer after an existing booking's check-out
        const existingCheckOut = new Date(existing.check_out);
        const bufferEnd = addHours(existingCheckOut, cleaningBufferHours);
        const newCheckIn = startOfDay(parseISO(checkIn));

        if (newCheckIn >= existingCheckOut && newCheckIn < startOfDay(bufferEnd)) {
          if (!isAdminRole) {
            errs.push(`Check-in conflicts with ${cleaningBufferHours}h cleaning buffer after a checkout on ${existing.check_out}.`);
          }
          break;
        }
      }
    }

    return errs;
  }, [selectedUnit, checkIn, checkOut, numGuests, maintenanceBlocks, existingBookings.data, cleaningBufferHours, isAdminRole]);

  // Cleaning buffer warning (for admins who can override)
  const bufferWarning = useMemo(() => {
    if (!isAdminRole || !selectedUnit || !checkIn || !checkOut || !existingBookings.data?.length) return null;
    for (const existing of existingBookings.data) {
      const existingCheckOut = new Date(existing.check_out);
      const bufferEnd = addHours(existingCheckOut, cleaningBufferHours);
      const newCheckIn = startOfDay(parseISO(checkIn));
      if (newCheckIn >= existingCheckOut && newCheckIn < startOfDay(bufferEnd)) {
        return `Check-in falls within the ${cleaningBufferHours}h cleaning buffer. You may override as Admin.`;
      }
    }
    return null;
  }, [isAdminRole, selectedUnit, checkIn, checkOut, existingBookings.data, cleaningBufferHours]);

  // Pricing breakdown
  const pricing: PricingSummary = useMemo(() => {
    if (!selectedUnit || !checkIn || !checkOut || validationErrors.length > 0) {
      return { nights: [], subtotal: 0, cleaningFee: 0, total: 0 };
    }
    return calculatePricing(selectedUnit, checkIn, checkOut, allPricingRules ?? []);
  }, [selectedUnit, checkIn, checkOut, allPricingRules, validationErrors]);

  const onSubmit = async (data: FormValues) => {
    if (validationErrors.length > 0) return;

    try {
      await createBooking.mutateAsync({
        unit_id: data.unit_id,
        check_in: data.check_in,
        check_out: data.check_out,
        num_guests: Number(data.num_guests),
        notes: data.notes || null,
        guest_id: data.guest_id || null,
        total_price: pricing.total > 0 ? pricing.total : null,
        state: "inquiry",
      });
      toast({ title: "Booking created", description: "New inquiry has been logged." });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Error creating booking",
        description: err.message?.includes("overlap")
          ? "These dates overlap with an existing booking for this unit."
          : err.message,
        variant: "destructive",
      });
    }
  };

  // Summarize pricing sources used
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Booking</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Unit *</Label>
            <Select value={selectedUnitId} onValueChange={(v) => setValue("unit_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a unit" />
              </SelectTrigger>
              <SelectContent>
                {activeUnits.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                    <span className="text-muted-foreground ml-1 text-xs">
                      (max {u.capacity}, min {u.min_nights}n)
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" {...register("unit_id", { required: true })} />
            {errors.unit_id && <p className="text-sm text-destructive">Unit is required</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="check_in">Check-in *</Label>
              <Input id="check_in" type="date" {...register("check_in", { required: true })} />
              {errors.check_in && <p className="text-sm text-destructive">Required</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="check_out">Check-out *</Label>
              <Input id="check_out" type="date" {...register("check_out", { required: true })} />
              {errors.check_out && <p className="text-sm text-destructive">Required</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="num_guests">Number of Guests</Label>
            <Input
              id="num_guests"
              type="number"
              min={1}
              max={selectedUnit?.capacity ?? 99}
              {...register("num_guests")}
            />
          </div>

          {/* Validation warnings */}
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

          {/* Admin buffer override warning */}
          {bufferWarning && validationErrors.length === 0 && (
            <div className="rounded-md border border-warning/50 bg-warning/5 p-3">
              <div className="flex items-center gap-2 text-sm text-warning-foreground">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{bufferWarning}</span>
              </div>
            </div>
          )}

          {/* Pricing breakdown */}
          {pricing.nights.length > 0 && validationErrors.length === 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Price Breakdown</h4>
              <div className="space-y-1">
                {pricingSources.map(({ source, name, count }, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {SOURCE_LABELS[source] ?? source}
                      </Badge>
                      {name && <span>({name})</span>}
                      <span>× {count} night{count > 1 ? "s" : ""}</span>
                    </span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal ({pricing.nights.length} night{pricing.nights.length > 1 ? "s" : ""})</span>
                <span className="font-medium">${pricing.subtotal.toFixed(2)}</span>
              </div>
              {pricing.cleaningFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cleaning fee</span>
                  <span className="font-medium">${pricing.cleaningFee.toFixed(2)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span>${pricing.total.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Guest (optional)</Label>
            <Input
              placeholder="Search by name or email…"
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              className="mb-1"
            />
            <Select value={selectedGuestId} onValueChange={(v) => setValue("guest_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a guest" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No guest</SelectItem>
                {filteredGuests.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.full_name ?? p.email ?? p.user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" {...register("guest_id")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...register("notes")} placeholder="Special requests, arrival time…" rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createBooking.isPending || validationErrors.length > 0}>
              {createBooking.isPending ? "Creating…" : "Create Inquiry"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
