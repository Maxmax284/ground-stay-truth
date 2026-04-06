import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTodaysPickups } from "@/hooks/useAirportPickups";
import { useFlightTrackingBatch, useCheckFlightStatus, FLIGHT_STATUS_CONFIG } from "@/hooks/useFlightTracking";
import { getTravelState } from "@/lib/travelState";
import { normalizeArrival, ARRIVAL_TYPE_CONFIG } from "@/lib/arrivalModel";
import { Plane, MessageSquare, Car, Clock, User, RefreshCw, Loader2, AlertTriangle, Shield, Ship, Bus, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ManualAssistBanner } from "@/components/ManualAssistBanner";

const STATUS_COLORS: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  assigned: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  completed: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  requested: "Awaiting Driver",
  assigned: "Driver Assigned",
  confirmed: "Confirmed",
  completed: "Completed",
};

interface Props {
  onClickBooking?: (id: string) => void;
}

export function TodaysPickupsWidget({ onClickBooking }: Props) {
  const { data: pickups, isLoading } = useTodaysPickups();
  const { toast } = useToast();
  const [checkingId, setCheckingId] = useState<string | null>(null);

  // Gather pickup IDs for batch flight lookup
  const pickupIds = (pickups ?? []).map((p: any) => p.id);
  const { data: flightMap } = useFlightTrackingBatch(pickupIds);
  const checkFlight = useCheckFlightStatus();

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!pickups || pickups.length === 0) return null;

  const needsAttention = pickups.filter((p: any) => p.status === "requested").length;

  const handleCheckFlight = async (pickupId: string, flightNumber: string) => {
    setCheckingId(pickupId);
    try {
      const result = await checkFlight.mutateAsync({ pickup_id: pickupId, flight_number: flightNumber, force_refresh: true });
      if (result.found === false) {
        toast({ title: "Flight Not Found", description: `No data found for ${flightNumber}. Check the flight number.`, variant: "destructive" });
      } else {
        const status = FLIGHT_STATUS_CONFIG[result.flight.flight_status];
        toast({ title: "Flight Updated", description: `${flightNumber}: ${status?.emoji ?? ""} ${status?.label ?? result.flight.flight_status}${result.flight.delay_minutes > 0 ? ` (delayed ${result.flight.delay_minutes}min)` : ""}` });
      }
    } catch (err: any) {
      toast({ title: "Flight Check Failed", description: err.message, variant: "destructive" });
    } finally {
      setCheckingId(null);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Today's Arrivals
            <Badge variant="secondary" className="text-xs ml-1">{pickups.length}</Badge>
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {pickups.filter((p: any) => (p as any).international_flight_number && !p.flight_number).length > 0 && (
              <Badge variant="outline" className="text-[10px] border-warning/50 text-warning-foreground">
                {pickups.filter((p: any) => (p as any).international_flight_number && !p.flight_number).length} missing domestic
              </Badge>
            )}
            {needsAttention > 0 && (
              <Badge variant="destructive" className="text-xs animate-pulse">
                {needsAttention} need{needsAttention > 1 ? "" : "s"} driver
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {pickups.map((p: any) => {
          const guestName = p.bookings?.profiles?.full_name ?? "Guest";
          const unitName = p.bookings?.units?.name ?? "";
          const driverName = p.drivers?.name;
          const time = p.arrival_datetime
            ? new Date(p.arrival_datetime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : null;

          const arrival = normalizeArrival(p);
          const arrivalConfig = ARRIVAL_TYPE_CONFIG[arrival.arrivalType];
          const ArrivalIcon = arrival.arrivalType === "ferry" ? Ship : arrival.arrivalType === "bus" ? Bus : Plane;

          const whatsappLink = p.drivers?.whatsapp
            ? `https://wa.me/${p.drivers.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Pickup update for ${guestName}`)}`
            : null;

          const ft = flightMap?.[p.id];
          const flightStatus = ft ? FLIGHT_STATUS_CONFIG[ft.flight_status] ?? FLIGHT_STATUS_CONFIG.unknown : null;
          const isChecking = checkingId === p.id;

          return (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-lg border p-3 text-sm cursor-pointer hover:bg-accent/30 transition-colors ${
                p.status === "requested" ? "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10" : ""
              }`}
              onClick={() => onClickBooking?.(p.booking_id)}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{guestName}</span>
                  {unitName && <span className="text-xs text-muted-foreground">· {unitName}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  {time && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {time}
                      {arrival.confidence === "flexible" && <span className="text-[9px] text-muted-foreground">(~)</span>}
                    </span>
                  )}
                  {/* Arrival type badge */}
                  {arrival.arrivalType !== "flight" && (
                    <span className="flex items-center gap-1">
                      <ArrivalIcon className="h-3 w-3" />
                      <span className="capitalize">{arrivalConfig.label}</span>
                    </span>
                  )}
                  {arrival.locationName && arrival.arrivalType !== "flight" && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {arrival.locationName}
                    </span>
                  )}
                  {/* Show connecting flight route or single flight */}
                  {arrival.arrivalType === "flight" && (p as any).international_flight_number ? (
                    <span className="flex items-center gap-1">
                      <Plane className="h-3 w-3" />
                      <span className="text-muted-foreground">{(p as any).international_flight_number}</span>
                      <span className="text-primary">→</span>
                      <span className="font-medium text-foreground">{p.flight_number || "TBD"}</span>
                    </span>
                  ) : arrival.arrivalType === "flight" && p.flight_number ? (
                    <span className="flex items-center gap-1">
                      <Plane className="h-3 w-3" /> {p.flight_number}
                    </span>
                  ) : null}
                  {p.passenger_count > 1 && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" /> {p.passenger_count} pax
                    </span>
                  )}
                  {driverName && (
                    <span className="flex items-center gap-1">
                      <Car className="h-3 w-3" /> {driverName}
                      {p.drivers?.license_plate && <span className="text-[10px]">({p.drivers.license_plate})</span>}
                    </span>
                  )}
                </div>
                {/* Travel state — centralized awareness */}
                {(() => {
                  const travelInfo = getTravelState({
                    status: p.status,
                    flight_number: p.flight_number,
                    international_flight_number: (p as any).international_flight_number,
                    final_flight_confirmed: (p as any).final_flight_confirmed ?? false,
                    confirmed_airport: (p as any).confirmed_airport,
                    guest_landed_at: (p as any).guest_landed_at,
                    arrival_datetime: p.arrival_datetime,
                  });
                  if (travelInfo.state === "in_transit_bkk") {
                    return (
                      <div className="text-[11px] text-warning-foreground font-medium">
                        🔄 {travelInfo.staffLabel} — {p.flight_number ? `connecting via ${p.flight_number}` : "awaiting domestic flight"}
                      </div>
                    );
                  }
                  if (travelInfo.state === "arriving") {
                    return (
                      <div className="text-[11px] text-[hsl(var(--success))] font-medium">
                        ✅ {travelInfo.staffLabel} — ready for dispatch
                      </div>
                    );
                  }
                  if (travelInfo.state === "missing_final_flight") {
                    return (
                      <div className="text-[11px] text-warning-foreground font-medium">
                        ⚠️ {travelInfo.staffLabel} — pickup timing unavailable
                      </div>
                    );
                  }
                  if (travelInfo.state === "pre_departure" && !p.flight_number && !(p as any).international_flight_number) {
                    return (
                      <div className="text-[11px] text-muted-foreground italic">
                        No flight details provided
                      </div>
                    );
                  }
                  return null;
                })()}
                {/* Assist mode indicator */}
                {(p as any).assist_mode && (p as any).assist_mode !== "healthy" && (
                  <ManualAssistBanner
                    bookingId={p.booking_id}
                    pickupId={p.id}
                    assistMode={(p as any).assist_mode}
                    assistReason={(p as any).assist_reason}
                    guestName={guestName}
                    compact
                  />
                )}
                {/* Flight delay info */}
                {ft && ft.delay_minutes > 0 && (
                  <div className="text-[11px] text-orange-600 dark:text-orange-400 flex items-center gap-1">
                    ⏱ Delayed {ft.delay_minutes} min
                    {ft.estimated_arrival && (
                      <span>
                        · ETA {new Date(ft.estimated_arrival).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {/* Flight status badge */}
                {flightStatus && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge className={`text-[10px] ${flightStatus.color}`}>
                          {flightStatus.emoji} {flightStatus.label}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <p>Last checked: {ft ? new Date(ft.last_checked_at).toLocaleTimeString() : "—"}</p>
                        {ft?.airline_name && <p>{ft.airline_name}</p>}
                        {ft?.terminal && <p>Terminal {ft.terminal}</p>}
                        {ft?.gate && <p>Gate {ft.gate}</p>}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {/* Check flight button */}
                {p.flight_number && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={isChecking}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCheckFlight(p.id, p.flight_number);
                    }}
                    title="Check flight status"
                  >
                    {isChecking ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 text-primary" />
                    )}
                  </Button>
                )}
                {/* Pickup status */}
                <Badge className={STATUS_COLORS[p.status] ?? ""}>
                  {STATUS_LABELS[p.status] ?? p.status}
                </Badge>
                {whatsappLink && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => { e.stopPropagation(); window.open(whatsappLink, "_blank"); }}
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-primary" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
