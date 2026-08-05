import { useAirportPickup } from "@/hooks/useAirportPickups";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { formatPrice } from "@/lib/currency";
import { getTravelState, type TravelStateInfo } from "@/lib/travelState";
import { normalizeArrival, ARRIVAL_TYPE_CONFIG, PICKUP_RESOLUTION_LABELS, isActivePickup, type PickupResolution } from "@/lib/arrivalModel";
import { formatCampLabeled } from "@/lib/timezone";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Plane, Car, Clock, User, MessageSquare, CheckCircle2, Loader2, AlertTriangle, ArrowRight, MapPin, Info, Ship, Bus } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Plane }> = {
  requested: { label: "Pickup Requested", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: Loader2 },
  assigned: { label: "Driver Assigned", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: Car },
  confirmed: { label: "Confirmed", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", icon: CheckCircle2 },
  completed: { label: "Completed", color: "bg-muted text-muted-foreground", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-destructive/10 text-destructive", icon: Plane },
};

const SEVERITY_STYLES: Record<TravelStateInfo["severity"], string> = {
  info: "bg-primary/5 border-primary/20 text-primary",
  warning: "bg-warning/10 border-warning/30 text-warning-foreground",
  success: "bg-[hsl(var(--success)/0.08)] border-[hsl(var(--success)/0.3)] text-[hsl(var(--success))]",
  muted: "bg-muted/50 border-border text-muted-foreground",
  destructive: "bg-destructive/10 border-destructive/20 text-destructive",
};

const SEVERITY_ICONS: Record<TravelStateInfo["severity"], typeof Plane> = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
  muted: Info,
  destructive: AlertTriangle,
};

const ARRIVAL_ICONS: Record<string, typeof Plane> = {
  flight: Plane,
  ferry: Ship,
  bus: Bus,
  hybrid: MapPin,
  unknown: MapPin,
};

interface Props {
  bookingId: string;
  guestName?: string | null;
}

export function GuestPickupCard({ bookingId, guestName }: Props) {
  const { data: pickup, isLoading } = useAirportPickup(bookingId);
  const { data: policies } = usePolicySettings();

  if (isLoading || !pickup) return null;
  if (pickup.status === "cancelled") return null;

  const arrival = normalizeArrival({ ...pickup, driver_id: pickup.driver_id ?? null, confirmed_at: pickup.confirmed_at ?? null });
  const config = STATUS_CONFIG[pickup.status] ?? STATUS_CONFIG.requested;
  const driver = pickup.drivers;

  // Compute travel state from centralized utility
  const travelInfo = getTravelState({
    status: pickup.status,
    flight_number: pickup.flight_number,
    international_flight_number: pickup.international_flight_number,
    final_flight_confirmed: pickup.final_flight_confirmed ?? false,
    confirmed_airport: pickup.confirmed_airport,
    guest_landed_at: pickup.guest_landed_at,
    arrival_datetime: pickup.arrival_datetime,
    arrival_type: pickup.arrival_type,
    arrival_location_type: pickup.arrival_location_type,
    arrival_location_name: pickup.arrival_location_name,
    arrival_confidence: pickup.arrival_confidence,
    transport_intent: pickup.transport_intent,
    pickup_enabled: pickup.pickup_enabled,
  });

  const intlFlight = pickup.international_flight_number;
  const ArrivalIcon = ARRIVAL_ICONS[arrival.arrivalType] ?? MapPin;
  const arrivalLabel = ARRIVAL_TYPE_CONFIG[arrival.arrivalType]?.label ?? "Arrival";
  const pickupLabel = PICKUP_RESOLUTION_LABELS[arrival.pickupResolution];

  // Self-arrival or pickup disabled — show simplified card
  if (arrival.pickupResolution !== "pickup_scheduled") {
    return (
      <Card className="border-border bg-muted/30">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrivalIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">{arrivalLabel} Arrival</span>
            </div>
            <Badge className={pickupLabel.color}>{pickupLabel.label}</Badge>
          </div>
          {arrival.arrivalTime && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {new Date(arrival.arrivalTime).toLocaleDateString([], { month: "short", day: "numeric" })}
              {" "}
              {new Date(arrival.arrivalTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {arrival.confidence === "flexible" && <Badge variant="outline" className="text-[9px] ml-1">Flexible</Badge>}
            </div>
          )}
          {arrival.locationName && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {arrival.locationName}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{travelInfo.guestGuidance}</p>
        </CardContent>
      </Card>
    );
  }

  const whatsappLink = driver?.whatsapp
    ? `https://wa.me/${driver.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Hi, I'm ${guestName ?? "your guest"}, arriving soon.${pickup.flight_number ? ` Flight ${pickup.flight_number}.` : ""}`
      )}`
    : null;

  const GuidanceIcon = SEVERITY_ICONS[travelInfo.severity];

  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
      <CardContent className="p-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrivalIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-semibold text-foreground">
              {arrival.arrivalType === "flight" ? "Airport Pickup" : `${arrivalLabel} Pickup`}
            </span>
          </div>
          <Badge className={config.color}>{config.label}</Badge>
        </div>

        {/* Route display: international → domestic (flights only) */}
        {arrival.arrivalType === "flight" && intlFlight && pickup.flight_number && (
          <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg p-2 text-xs text-muted-foreground">
            <Plane className="h-3 w-3 shrink-0" />
            <span>{intlFlight}</span>
            <ArrowRight className="h-3 w-3 shrink-0 text-primary" />
            <span className="font-medium text-foreground">{pickup.flight_number}</span>
            <Badge variant="secondary" className="text-[9px] ml-auto">Connecting</Badge>
          </div>
        )}

        {/* Location for non-flight arrivals */}
        {arrival.arrivalType !== "flight" && arrival.locationName && (
          <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg p-2 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span>{arrival.locationName}</span>
            {arrival.confidence === "flexible" && (
              <Badge variant="outline" className="text-[9px] ml-auto">Flexible timing</Badge>
            )}
          </div>
        )}

        {/* Travel state guidance */}
        {travelInfo.guestGuidance && travelInfo.state !== "arrived" && travelInfo.state !== "cancelled" && (
          <div className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${SEVERITY_STYLES[travelInfo.severity]}`}>
            <GuidanceIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{travelInfo.guestGuidance}</p>
          </div>
        )}

        {/* Manual Assist — calm guest reassurance */}
        {pickup.assist_mode && pickup.assist_mode !== "healthy" && (
          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
            <p className="leading-relaxed text-muted-foreground">
              Our team is personally coordinating your arrival. You may hear from us directly — no action needed from you right now.
            </p>
          </div>
        )}

        {/* Details */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {pickup.flight_number && !intlFlight && arrival.arrivalType === "flight" && (
            <span className="flex items-center gap-1">
              <Plane className="h-3 w-3" /> {pickup.flight_number}
            </span>
          )}
          {pickup.arrival_datetime && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(pickup.arrival_datetime).toLocaleDateString([], { month: "short", day: "numeric" })}
              {" "}
              {new Date(pickup.arrival_datetime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {(pickup.passenger_count ?? 0) > 1 && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" /> {pickup.passenger_count} passengers
            </span>
          )}
        </div>

        {/* Fee */}
        {pickup.fee > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Pickup fee</span>
            <span className="font-medium text-foreground">{formatPrice(pickup.fee, policies)}</span>
          </div>
        )}

        {/* Driver info */}
        {driver && (
          <>
            <Separator />
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Car className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                Your Driver: {driver.name}
              </p>
              {driver.vehicle_type && (
                <p className="text-xs text-muted-foreground pl-[18px]">
                  {driver.vehicle_type}
                  {driver.license_plate && ` · ${driver.license_plate}`}
                </p>
              )}
              {whatsappLink && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5 mt-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(whatsappLink, "_blank");
                  }}
                >
                  <MessageSquare className="h-3 w-3" />
                  Message Driver on WhatsApp
                </Button>
              )}
            </div>
          </>
        )}

        {/* No driver yet */}
        {!driver && pickup.status === "requested" && (
          <p className="text-xs text-muted-foreground italic">
            A driver will be assigned shortly. You'll see their details here once confirmed.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
