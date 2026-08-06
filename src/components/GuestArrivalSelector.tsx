/**
 * Guest Arrival Type Selector
 *
 * Adaptive arrival flow: "How are you arriving?" → dynamic fields.
 * Replaces the rigid flight-only form approach.
 */
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plane, Ship, Bus, Route, MapPin, Clock, CheckCircle2, Loader2 } from "lucide-react";
import {
  ARRIVAL_TYPES, ARRIVAL_TYPE_CONFIG, SAMUI_LOCATIONS,
  getDefaultLocation, type ArrivalType, type TransportIntent,
} from "@/lib/arrivalModel";
import { useUpsertAirportPickup, type AirportPickup } from "@/hooks/useAirportPickups";
import { useToast } from "@/hooks/use-toast";
import { toCampInputValue, fromCampInputValue } from "@/lib/timezone";

const TYPE_ICONS: Record<ArrivalType, typeof Plane> = {
  flight: Plane,
  ferry: Ship,
  bus: Bus,
  hybrid: Route,
  unknown: MapPin,
};

interface Props {
  bookingId: string;
  pickup: AirportPickup | null;
  baseFee: number;
}

export function GuestArrivalSelector({ bookingId, pickup, baseFee }: Props) {
  const { t } = useTranslation();
  const upsert = useUpsertAirportPickup();
  const { toast } = useToast();

  const [arrivalType, setArrivalType] = useState<ArrivalType>(
    (pickup?.arrival_type as ArrivalType) ?? "flight"
  );
  const [transportIntent, setTransportIntent] = useState<TransportIntent>(
    (pickup?.transport_intent as TransportIntent) ?? "pickup"
  );
  const [locationName, setLocationName] = useState(pickup?.arrival_location_name ?? "");
  const [arrivalTime, setArrivalTime] = useState(
    toCampInputValue(pickup?.arrival_datetime)
  );
  // Flight-specific
  const [intlFlight, setIntlFlight] = useState(pickup?.international_flight_number ?? "");
  const [domesticFlight, setDomesticFlight] = useState(pickup?.flight_number ?? "");

  useEffect(() => {
    if (pickup) {
      setArrivalType((pickup.arrival_type as ArrivalType) ?? "flight");
      setTransportIntent((pickup.transport_intent as TransportIntent) ?? "pickup");
      setLocationName(pickup.arrival_location_name ?? "");
      setArrivalTime(toCampInputValue(pickup.arrival_datetime));
      setIntlFlight(pickup.international_flight_number ?? "");
      setDomesticFlight(pickup.flight_number ?? "");
    }
  }, [pickup]);

  const config = ARRIVAL_TYPE_CONFIG[arrivalType];
  const defaultLoc = getDefaultLocation(arrivalType);
  const isFlight = arrivalType === "flight";
  const isFerry = arrivalType === "ferry";

  const handleSave = async () => {
    try {
      const updates: any = {
        booking_id: bookingId,
        arrival_type: arrivalType,
        arrival_location_type: config.defaultLocationType,
        arrival_location_name: isFlight
          ? "Samui Airport (USM)"
          : locationName || defaultLoc.name,
        arrival_confidence: config.defaultConfidence,
        transport_intent: transportIntent,
        arrival_datetime: fromCampInputValue(arrivalTime),
        fee: baseFee,
        status: pickup?.status ?? "requested",
      };

      if (isFlight) {
        updates.international_flight_number = intlFlight.trim().toUpperCase() || null;
        updates.flight_number = domesticFlight.trim().toUpperCase() || null;
        if (domesticFlight.trim()) {
          updates.final_flight_confirmed = true;
        }
      } else {
        // Clear flight fields for non-flight arrivals
        updates.flight_number = null;
        updates.international_flight_number = null;
        updates.final_flight_confirmed = false;
      }

      await upsert.mutateAsync(updates);
      toast({ title: t("guestStay.arrivalSaved", "Arrival details saved") });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const pierLocations = SAMUI_LOCATIONS.filter((l) => l.type === "pier");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          {t("guestStay.howArriving", "How are you arriving?")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Arrival type selection */}
        <div className="grid grid-cols-4 gap-2">
          {(["flight", "ferry", "bus", "hybrid"] as ArrivalType[]).map((type) => {
            const Icon = TYPE_ICONS[type];
            const cfg = ARRIVAL_TYPE_CONFIG[type];
            const isActive = arrivalType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setArrivalType(type)}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all text-center ${
                  isActive
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-[11px] font-medium">{cfg.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tone guidance */}
        <p className="text-xs text-muted-foreground">{config.toneSuffix}</p>

        {/* Transport intent */}
        <div className="space-y-1.5">
          <Label className="text-xs">{t("guestStay.transportIntent", "Do you need a pickup?")}</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTransportIntent("pickup")}
              className={`p-2.5 rounded-lg border-2 text-xs font-medium transition-all ${
                transportIntent === "pickup"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              ✅ Yes, please arrange a pickup
            </button>
            <button
              type="button"
              onClick={() => setTransportIntent("self_arrival")}
              className={`p-2.5 rounded-lg border-2 text-xs font-medium transition-all ${
                transportIntent === "self_arrival"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              🚗 I'll get there myself
            </button>
          </div>
        </div>

        {/* Dynamic fields based on arrival type */}
        {isFlight && (
          <div className="space-y-3 bg-muted/30 rounded-lg p-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">International Flight (e.g. TG925)</Label>
              <Input
                value={intlFlight}
                onChange={(e) => setIntlFlight(e.target.value)}
                placeholder="TG925"
                className="h-8 text-sm font-mono uppercase"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Final Flight to Samui (e.g. PG123)</Label>
              <Input
                value={domesticFlight}
                onChange={(e) => setDomesticFlight(e.target.value)}
                placeholder="PG123"
                className="h-8 text-sm font-mono uppercase"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Arrival Date &amp; Time (Thailand time)</Label>
              <Input
                type="datetime-local"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
        )}

        {isFerry && (
          <div className="space-y-3 bg-muted/30 rounded-lg p-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Which pier?</Label>
              <Select value={locationName || defaultLoc.name} onValueChange={setLocationName}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pierLocations.map((loc) => (
                    <SelectItem key={loc.name} value={loc.name}>{loc.name}</SelectItem>
                  ))}
                  <SelectItem value="Other / Not sure yet">Not sure yet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Approximate arrival time (Thailand time)</Label>
              <Input
                type="datetime-local"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className="h-8 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Ferry times can vary — an estimate is fine</p>
            </div>
          </div>
        )}

        {(arrivalType === "bus" || arrivalType === "hybrid") && (
          <div className="space-y-3 bg-muted/30 rounded-lg p-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Where will you arrive?</Label>
              <Input
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder={arrivalType === "hybrid" ? "Final arrival point on Samui" : "Bus station or drop-off point"}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Approximate arrival time (Thailand time)</Label>
              <Input
                type="datetime-local"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className="h-8 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Just your best estimate — we'll be flexible</p>
            </div>
          </div>
        )}

        {/* Save */}
        <Button
          onClick={handleSave}
          disabled={upsert.isPending}
          className="w-full gap-1.5"
          size="sm"
        >
          {upsert.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
          ) : pickup ? (
            <><CheckCircle2 className="h-4 w-4" /> Update Arrival Details</>
          ) : (
            <><CheckCircle2 className="h-4 w-4" /> Save Arrival Details</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
