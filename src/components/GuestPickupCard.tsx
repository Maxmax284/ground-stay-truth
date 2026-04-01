import { useAirportPickup } from "@/hooks/useAirportPickups";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { formatPrice } from "@/lib/currency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Plane, Car, Clock, User, MessageSquare, CheckCircle2, Loader2, AlertTriangle, ArrowRight } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Plane }> = {
  requested: { label: "Pickup Requested", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: Loader2 },
  assigned: { label: "Driver Assigned", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: Car },
  confirmed: { label: "Confirmed", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", icon: CheckCircle2 },
  completed: { label: "Completed", color: "bg-muted text-muted-foreground", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-destructive/10 text-destructive", icon: Plane },
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

  const config = STATUS_CONFIG[pickup.status] ?? STATUS_CONFIG.requested;
  const driver = pickup.drivers;

  // Connecting flight logic
  const hasInternationalFlight = !!(pickup as any).international_flight_number;
  const finalFlightConfirmed = !!(pickup as any).final_flight_confirmed;
  const needsDomesticFlight = hasInternationalFlight && !pickup.flight_number;
  const isConnecting = hasInternationalFlight && !!pickup.flight_number;

  const whatsappLink = driver?.whatsapp
    ? `https://wa.me/${driver.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Hi, I'm ${guestName ?? "your guest"}, arriving at Lamai Muay Thai.${pickup.flight_number ? ` Flight ${pickup.flight_number}.` : ""}`
      )}`
    : null;

  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
      <CardContent className="p-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-semibold text-foreground">Airport Pickup</span>
          </div>
          <Badge className={config.color}>{config.label}</Badge>
        </div>

        {/* Connecting flight info */}
        {isConnecting && (
          <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg p-2 text-xs text-muted-foreground">
            <Plane className="h-3 w-3 shrink-0" />
            <span>{(pickup as any).international_flight_number}</span>
            <ArrowRight className="h-3 w-3 shrink-0 text-primary" />
            <span className="font-medium text-foreground">{pickup.flight_number}</span>
            <Badge variant="secondary" className="text-[9px] ml-auto">Connecting</Badge>
          </div>
        )}

        {/* Missing domestic flight nudge */}
        {needsDomesticFlight && (
          <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-2.5 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-warning-foreground shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-medium text-warning-foreground">Domestic flight needed</p>
              <p className="text-muted-foreground">
                Your international flight ({(pickup as any).international_flight_number}) lands in Bangkok. 
                Please book a domestic flight to Koh Samui (USM) and update your booking details so we can arrange your pickup.
              </p>
            </div>
          </div>
        )}

        {/* Flight details */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {pickup.flight_number && !isConnecting && (
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
