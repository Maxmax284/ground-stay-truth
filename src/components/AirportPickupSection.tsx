import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import { useAirportPickup, useUpsertAirportPickup, logPickupAction, type AirportPickup } from "@/hooks/useAirportPickups";
import { useDrivers } from "@/hooks/useDrivers";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { formatPrice } from "@/lib/currency";
import { Plane, Car, MessageSquare, User, Clock, AlertTriangle, ArrowRight, CheckCircle2, MapPin, UserCheck, Ship, Bus, Route, ShieldOff } from "lucide-react";
import { getTravelState } from "@/lib/travelState";
import { normalizeArrival, ARRIVAL_TYPE_CONFIG, PICKUP_RESOLUTION_LABELS, ARRIVAL_TYPES, isActivePickup, getPickupWarnings, type ArrivalType } from "@/lib/arrivalModel";
import { formatCampLabeled } from "@/lib/timezone";
import { ManualAssistBanner } from "@/components/ManualAssistBanner";

const STATUS_COLORS: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  assigned: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  completed: "bg-muted text-muted-foreground",
  failed: "bg-destructive/15 text-destructive",
  cancelled: "bg-destructive/10 text-destructive",
};

const AIRPORT_LABELS: Record<string, string> = {
  bkk: "Bangkok (BKK)",
  usm: "Koh Samui (USM)",
};

interface Props {
  bookingId: string;
  guestName?: string;
}

export function AirportPickupSection({ bookingId, guestName }: Props) {
  const { role } = useAuth();
  const { data: pickup, isLoading } = useAirportPickup(bookingId);
  const { data: drivers } = useDrivers(true);
  const { data: policies } = usePolicySettings();
  const upsert = useUpsertAirportPickup();
  const { toast } = useToast();
  const [editingFee, setEditingFee] = useState(false);
  const [feeValue, setFeeValue] = useState("");
  const [feeReason, setFeeReason] = useState("");
  const [editingFlights, setEditingFlights] = useState(false);
  const [intlFlight, setIntlFlight] = useState("");
  const [domesticFlight, setDomesticFlight] = useState("");
  const [arrivalDt, setArrivalDt] = useState("");
  const [paxCount, setPaxCount] = useState("1");

  const canManage = permissions.canTransitionState(role); // front_desk+

  const baseFee = useMemo(() => {
    const setting = policies?.find((p) => p.key === "transport_base_fee");
    return setting ? Number(setting.value) : 500;
  }, [policies]);

  const transportEnabled = policies?.find((p) => p.key === "transport_enabled");
  const isEnabled = transportEnabled ? String(transportEnabled.value) === "true" : false;

  if (isLoading) return null;

  // Show create button for staff when no pickup exists
  if (!pickup) {
    if (!canManage || !isEnabled) return null;
    return (
      <Card className="border-dashed border-primary/20">
        <CardContent className="p-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={async () => {
              try {
                await upsert.mutateAsync({
                  booking_id: bookingId,
                  fee: baseFee,
                  status: "requested",
                });
                toast({ title: "Airport pickup created" });
              } catch (err: any) {
                toast({ title: "Error", description: err.message, variant: "destructive" });
              }
            }}
            disabled={upsert.isPending}
          >
            <Plane className="h-4 w-4" />
            Add Airport Pickup
          </Button>
        </CardContent>
      </Card>
    );
  }

  const driver = pickup.drivers;
  const internationalFlight = pickup.international_flight_number;
  const finalFlightConfirmed = !!pickup.final_flight_confirmed;
  const confirmedAirport = pickup.confirmed_airport;
  const guestLandedAt = pickup.guest_landed_at;
  const hasConnection = !!internationalFlight;

  // Unified arrival model
  const arrival = normalizeArrival({ ...pickup, driver_id: pickup.driver_id ?? null, confirmed_at: pickup.confirmed_at ?? null });
  const arrivalTypeConfig = ARRIVAL_TYPE_CONFIG[arrival.arrivalType];
  const pickupLabel = PICKUP_RESOLUTION_LABELS[arrival.pickupResolution];

  // Centralized travel state
  const travelInfo = getTravelState({
    status: pickup.status,
    flight_number: pickup.flight_number,
    international_flight_number: internationalFlight,
    final_flight_confirmed: finalFlightConfirmed,
    confirmed_airport: confirmedAirport,
    guest_landed_at: guestLandedAt,
    arrival_datetime: pickup.arrival_datetime,
    arrival_type: pickup.arrival_type,
    arrival_location_type: pickup.arrival_location_type,
    arrival_location_name: pickup.arrival_location_name,
    arrival_confidence: pickup.arrival_confidence,
    transport_intent: pickup.transport_intent,
    pickup_enabled: pickup.pickup_enabled,
  });

  const handleAssignDriver = async (driverId: string) => {
    try {
      const prevStatus = pickup.status;
      const newStatus = prevStatus === "requested" ? "assigned" : prevStatus;
      await upsert.mutateAsync({
        booking_id: bookingId,
        driver_id: driverId,
        status: newStatus,
        assigned_at: new Date().toISOString(),
      });
      const assignedDriver = drivers?.find(d => d.id === driverId);
      await logPickupAction({
        bookingId,
        pickupId: pickup.id,
        action: "driver_assigned",
        fromStatus: prevStatus,
        toStatus: newStatus,
        note: assignedDriver ? `Driver assigned: ${assignedDriver.name}` : "Driver assigned",
      });
      toast({ title: "Driver assigned" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    const prevStatus = pickup.status;
    const updates: Partial<AirportPickup> & { booking_id: string } = {
      booking_id: bookingId,
      status: newStatus,
    };
    if (newStatus === "confirmed") updates.confirmed_at = new Date().toISOString();
    if (newStatus === "completed") {
      updates.completed_at = new Date().toISOString();
    }
    try {
      await upsert.mutateAsync(updates);
      await logPickupAction({
        bookingId,
        pickupId: pickup.id,
        action: `status_${newStatus}`,
        fromStatus: prevStatus,
        toStatus: newStatus,
        note: `Pickup status changed: ${prevStatus} → ${newStatus}`,
      });
      toast({ title: `Pickup ${newStatus}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleFeeOverride = async () => {
    if (!feeValue || !feeReason.trim()) return;
    try {
      await upsert.mutateAsync({
        booking_id: bookingId,
        fee: Number(feeValue),
        fee_override: true,
        fee_override_reason: feeReason.trim(),
      });
      await logPickupAction({
        bookingId,
        pickupId: pickup.id,
        action: "fee_override",
        note: `Fee changed to ฿${feeValue}: ${feeReason.trim()}`,
      });
      toast({ title: "Fee updated" });
      setEditingFee(false);
      setFeeReason("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleSaveFlights = async () => {
    try {
      const updates: any = { booking_id: bookingId };
      updates.international_flight_number = intlFlight.trim().toUpperCase() || null;
      updates.flight_number = domesticFlight.trim().toUpperCase() || null;
      updates.arrival_datetime = arrivalDt ? new Date(arrivalDt).toISOString() : null;
      updates.passenger_count = Math.max(1, parseInt(paxCount) || 1);
      if (domesticFlight.trim()) {
        updates.final_flight_confirmed = true;
      }
      await upsert.mutateAsync(updates);
      const manualPrefix = pickup.assist_mode === "manual_assist" ? "[MANUAL] " : "";
      await logPickupAction({
        bookingId,
        pickupId: pickup.id,
        action: `${manualPrefix}flights_updated`,
        note: `${manualPrefix}Flights updated: Int'l ${intlFlight.trim().toUpperCase() || "—"}, Final ${domesticFlight.trim().toUpperCase() || "—"}, Arrival ${arrivalDt || "—"}, Pax ${paxCount}`,
      });
      toast({ title: isManualAssist ? "Flight details updated (manual)" : "Flight details updated" });
      setEditingFlights(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const whatsappLink = driver?.whatsapp
    ? `https://wa.me/${driver.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Hi, pickup for ${guestName ?? "guest"} arriving at Lamai Muay Thai.${pickup.flight_number ? ` Flight ${pickup.flight_number}.` : ""}`
      )}`
    : null;

  const nextStatuses: string[] = [];
  if (pickup.status === "requested" && pickup.driver_id) nextStatuses.push("confirmed");
  if (pickup.status === "assigned") nextStatuses.push("confirmed");
  if (pickup.status === "confirmed") nextStatuses.push("completed");
  if (pickup.status !== "cancelled" && pickup.status !== "completed" && pickup.status !== "failed") {
    nextStatuses.push("failed", "cancelled");
  }

  const pickupWarnings = getPickupWarnings(arrival, { guestOnSite: !!guestLandedAt });

  const isManualAssist = pickup.assist_mode === "manual_assist";

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {arrival.arrivalType === "ferry" ? <Ship className="h-4 w-4 text-primary" /> :
             arrival.arrivalType === "bus" ? <Bus className="h-4 w-4 text-primary" /> :
             arrival.arrivalType === "hybrid" ? <Route className="h-4 w-4 text-primary" /> :
             <Plane className="h-4 w-4 text-primary" />}
            <span className="text-sm font-semibold">
              {arrival.arrivalType === "flight" ? "Airport Pickup" : `${arrivalTypeConfig.label} Pickup`}
            </span>
            <Badge variant="outline" className="text-[9px]">{arrivalTypeConfig.label}</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge className={pickupLabel.color}>{pickupLabel.label}</Badge>
            {arrival.driverAssigned && driver?.name && (
              <Badge variant="outline" className="text-[9px]">Driver: {driver.name}</Badge>
            )}
          </div>
        </div>

        {/* Driver-assignment & arrival reconciliation warnings */}
        {pickupWarnings.length > 0 && (
          <div className="space-y-1.5">
            {pickupWarnings.map((w, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${
                  w.severity === "critical"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-warning/40 bg-warning/10 text-warning-foreground"
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{w.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Arrival location & confidence */}
        {arrival.locationName && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span>{arrival.locationName}</span>
            {arrival.confidence === "flexible" && (
              <Badge variant="outline" className="text-[9px]">Flexible timing</Badge>
            )}
          </div>
        )}

        {/* Admin pickup override indicator */}
        {!pickup.pickup_enabled && (
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2 text-xs">
            <ShieldOff className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Pickup disabled by admin — guest will self-arrive</span>
          </div>
        )}

        {/* Manual Assist Banner */}
        <ManualAssistBanner
          bookingId={bookingId}
          pickupId={pickup.id}
          assistMode={pickup.assist_mode ?? "healthy"}
          assistReason={pickup.assist_reason ?? null}
          guestName={guestName}
          onContactGuest={() => {
            window.location.hash = `#messages-${bookingId}`;
          }}
        />

        {/* Travel state — centralized awareness */}
        {travelInfo.state !== "pre_departure" && travelInfo.state !== "awaiting_departure" && travelInfo.state !== "cancelled" && (
          <div className={`flex items-center gap-2 rounded-lg p-2.5 text-xs ${
            travelInfo.isInTransit || travelInfo.state === "missing_final_flight"
              ? "bg-warning/10 border border-warning/30"
              : travelInfo.state === "arriving" || travelInfo.state === "arrived"
                ? "bg-[hsl(var(--success)/0.08)] border border-[hsl(var(--success)/0.3)]"
                : "bg-muted/50 border border-border"
          }`}>
            <MapPin className={`h-3.5 w-3.5 shrink-0 ${
              travelInfo.isInTransit || travelInfo.state === "missing_final_flight" ? "text-warning-foreground" : "text-[hsl(var(--success))]"
            }`} />
            <div className="flex-1">
              <span className={`font-medium ${
                travelInfo.isInTransit || travelInfo.state === "missing_final_flight" ? "text-warning-foreground" : "text-[hsl(var(--success))]"
              }`}>
                {travelInfo.staffLabel}
              </span>
              <span className="block text-muted-foreground mt-0.5 text-[11px]">
                {travelInfo.staffDetail}
              </span>
              {guestLandedAt && (
                <span className="block text-muted-foreground mt-0.5">
                  Landed {formatCampLabeled(guestLandedAt)}
                </span>
              )}
            </div>
            {travelInfo.isInTransit && (
              <Badge variant="outline" className="text-[9px] border-warning/50 text-warning-foreground shrink-0">
                In Transit
              </Badge>
            )}
            {!travelInfo.operationallyReady && travelInfo.state !== "arrived" && (
              <Badge variant="outline" className="text-[9px] border-destructive/50 text-destructive shrink-0">
                No Dispatch
              </Badge>
            )}
          </div>
        )}

        {/* Flight route display */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Flight Details</Label>
            {canManage && !editingFlights && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => {
                  setIntlFlight(internationalFlight ?? "");
                  setDomesticFlight(pickup.flight_number ?? "");
                  setArrivalDt(pickup.arrival_datetime ? pickup.arrival_datetime.slice(0, 16) : "");
                  setPaxCount(String(pickup.passenger_count ?? 1));
                  setEditingFlights(true);
                }}
              >
                Edit
              </Button>
            )}
          </div>

          {!editingFlights ? (
            <div className="bg-muted/30 rounded-lg p-2.5 space-y-1.5">
              {/* International leg */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-20 shrink-0">International</span>
                {internationalFlight ? (
                  <span className="font-mono text-foreground">{internationalFlight}</span>
                ) : (
                  <span className="text-muted-foreground italic">Not set</span>
                )}
              </div>
              {/* Domestic / final leg */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-20 shrink-0">Final flight</span>
                {pickup.flight_number ? (
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-medium text-foreground">{pickup.flight_number}</span>
                    {finalFlightConfirmed && (
                      <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))]" />
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-warning-foreground italic">Not confirmed</span>
                    <AlertTriangle className="h-3 w-3 text-warning-foreground" />
                  </div>
                )}
              </div>
              {/* Route summary if both exist */}
              {hasConnection && pickup.flight_number && (
                <div className="flex items-center gap-1.5 pt-1 border-t border-border/50 text-xs text-muted-foreground">
                  <Plane className="h-3 w-3" />
                  <span>{internationalFlight}</span>
                  <ArrowRight className="h-3 w-3 text-primary" />
                  <span className="font-medium text-foreground">{pickup.flight_number}</span>
                  <Badge variant="secondary" className="text-[9px] ml-auto">Connecting</Badge>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2 bg-muted/30 rounded-lg p-2.5">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">International Flight (e.g. TG925)</Label>
                <Input
                  value={intlFlight}
                  onChange={(e) => setIntlFlight(e.target.value)}
                  placeholder="TG925"
                  className="h-7 text-sm font-mono uppercase"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Final Flight to Samui (e.g. PG123)</Label>
                <Input
                  value={domesticFlight}
                  onChange={(e) => setDomesticFlight(e.target.value)}
                  placeholder="PG123"
                  className="h-7 text-sm font-mono uppercase"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Arrival Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={arrivalDt}
                  onChange={(e) => setArrivalDt(e.target.value)}
                  className="h-7 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Passengers</Label>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={paxCount}
                  onChange={(e) => setPaxCount(e.target.value)}
                  className="h-7 text-sm w-20"
                />
              </div>
              <div className="flex gap-1">
                <Button size="sm" className="h-7 text-xs" onClick={handleSaveFlights} disabled={upsert.isPending}>
                  Save Flights
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingFlights(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Arrival time & passengers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
          {pickup.arrival_datetime && (
            <div className="flex items-center gap-1"><Clock className="h-3 w-3" /> Arrival {formatCampLabeled(pickup.arrival_datetime)}</div>
          )}
          {(pickup.passenger_count ?? 0) > 1 && (
            <div className="flex items-center gap-1"><User className="h-3 w-3" /> {pickup.passenger_count} pax</div>
          )}
          {pickup.luggage_notes && <div>🧳 {pickup.luggage_notes}</div>}
        </div>
        {pickup.special_instructions && (
          <p className="text-xs italic text-muted-foreground">{pickup.special_instructions}</p>
        )}

        <Separator />

        {/* Fee — billed as an add-on obligation on the booking */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Fee <span className="text-[10px]">(billed to booking)</span></span>

          <div className="flex items-center gap-2">
            <span className="font-medium">{formatPrice(pickup.fee, policies)}</span>
            {pickup.fee_override && (
              <Badge variant="outline" className="text-[10px]">Override</Badge>
            )}
            {canManage && !editingFee && (
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setEditingFee(true); setFeeValue(String(pickup.fee)); }}>
                Edit
              </Button>
            )}
          </div>
        </div>
        {editingFee && (
          <div className="space-y-2 bg-muted/30 rounded-md p-2">
            <div className="flex gap-2">
              <Input type="number" value={feeValue} onChange={(e) => setFeeValue(e.target.value)} className="h-7 text-sm w-24" />
              <Input value={feeReason} onChange={(e) => setFeeReason(e.target.value)} placeholder="Reason for change" className="h-7 text-sm flex-1" />
            </div>
            <div className="flex gap-1">
              <Button size="sm" className="h-7 text-xs" onClick={handleFeeOverride} disabled={upsert.isPending}>Save</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingFee(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <Separator />

        {/* Driver */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Driver</Label>
          {canManage ? (
            <Select value={pickup.driver_id ?? ""} onValueChange={handleAssignDriver}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Assign a driver" />
              </SelectTrigger>
              <SelectContent>
                {drivers?.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    <span className="flex items-center gap-1.5">
                      <Car className="h-3 w-3" /> {d.name}
                      {d.vehicle_type && <span className="text-muted-foreground">· {d.vehicle_type}</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : driver ? (
            <p className="text-sm">{driver.name}</p>
          ) : (
            <p className="text-xs text-muted-foreground">No driver assigned</p>
          )}

          {driver && (
            <div className="text-xs text-muted-foreground space-y-0.5 bg-muted/30 rounded-md p-2">
              <p className="font-medium text-foreground">{driver.name}</p>
              {driver.vehicle_type && <p>{driver.vehicle_type}{driver.license_plate ? ` · ${driver.license_plate}` : ""}</p>}
              {whatsappLink && (
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline mt-1">
                  <MessageSquare className="h-3 w-3" /> Message Driver on WhatsApp
                </a>
              )}
            </div>
          )}
        </div>

        {/* Admin controls: arrival type + pickup override */}
        {permissions.canAdminOverride(role) && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label className="text-xs font-medium">Admin Controls</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Arrival Type</Label>
                  <Select
                    value={pickup.arrival_type ?? "flight"}
                    onValueChange={async (val) => {
                      await upsert.mutateAsync({
                        booking_id: bookingId,
                        arrival_type: val,
                        arrival_location_type: ARRIVAL_TYPE_CONFIG[val as ArrivalType]?.defaultLocationType ?? "other",
                      });
                      toast({ title: `Arrival type set to ${val}` });
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ARRIVAL_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{ARRIVAL_TYPE_CONFIG[t].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Pickup Override</Label>
                  <Button
                    variant={pickup.pickup_enabled ? "default" : "destructive"}
                    size="sm"
                    className="h-7 text-xs w-full"
                    onClick={async () => {
                      const newVal = !pickup.pickup_enabled;
                      await upsert.mutateAsync({
                        booking_id: bookingId,
                        pickup_enabled: newVal,
                      });
                      await logPickupAction({
                        bookingId,
                        pickupId: pickup.id,
                        action: newVal ? "pickup_enabled" : "pickup_disabled",
                        note: newVal ? "Admin enabled pickup" : "Admin disabled pickup — guest will self-arrive",
                      });
                      toast({ title: newVal ? "Pickup enabled" : "Pickup disabled" });
                    }}
                    disabled={upsert.isPending}
                  >
                    {pickup.pickup_enabled ? "Pickup Enabled ✓" : "Pickup Disabled ✗"}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Status actions */}
        {canManage && nextStatuses.length > 0 && isActivePickup(arrival.pickupResolution) && (
          <>
            <Separator />
            <div className="flex flex-wrap gap-1.5">
              {nextStatuses.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={s === "cancelled" ? "destructive" : "default"}
                  className="h-7 text-xs"
                  onClick={() => handleStatusChange(s)}
                  disabled={upsert.isPending}
                >
                  {s === "confirmed" ? "Confirm Pickup" : s === "completed" ? "Mark Complete" : s === "failed" ? "Mark Not Completed" : "Cancel Pickup"}
                </Button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}