import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAirportTraffic, type AirportTrafficFlight } from "@/hooks/useAirportTraffic";
import { usePickupFlightsFallback } from "@/hooks/usePickupFlightsFallback";
import { Plane, PlaneLanding, PlaneTakeoff, Clock, Link2, AlertTriangle, Info } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-muted text-muted-foreground",
  active: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  landed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  diverted: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  incident: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  unknown: "bg-muted text-muted-foreground",
};

const STATUS_EMOJI: Record<string, string> = {
  scheduled: "📅",
  active: "✈️",
  landed: "✅",
  cancelled: "❌",
  diverted: "⚠️",
  incident: "🚨",
  unknown: "—",
};

interface Props {
  onClickBooking?: (id: string) => void;
}

export function FlightForecastWidget({ onClickBooking }: Props) {
  const [selectedAirport, setSelectedAirport] = useState<string>("USM");
  const { data: trafficFlights, isLoading: trafficLoading } = useAirportTraffic(selectedAirport);

  // Fallback: when airport-wide scan returns no data, use individual pickup flight lookups
  const trafficEmpty = !trafficLoading && (!trafficFlights || trafficFlights.length === 0);
  const { data: fallbackFlights, isLoading: fallbackLoading } = usePickupFlightsFallback(trafficEmpty);

  const isFallbackMode = trafficEmpty && (fallbackFlights?.length ?? 0) > 0;
  const flights = isFallbackMode ? fallbackFlights : trafficFlights;
  const isLoading = trafficLoading || (trafficEmpty && fallbackLoading);

  const arrivals = (flights ?? []).filter(f => f.direction === "arrival");
  const departures = (flights ?? []).filter(f => f.direction === "departure");
  const linkedFlights = (flights ?? []).filter(f => f.linked_pickup_id);
  const delayedFlights = (flights ?? []).filter(f => f.delay_minutes > 0);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Plane className="h-5 w-5 text-primary" />
            Flight Forecast
            {flights && (
              <Badge variant="secondary" className="text-xs ml-1">{flights.length} flights</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {linkedFlights.length > 0 && (
              <Badge className="bg-primary/10 text-primary text-[10px]">
                <Link2 className="h-3 w-3 mr-0.5" /> {linkedFlights.length} booked
              </Badge>
            )}
            {delayedFlights.length > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                <AlertTriangle className="h-3 w-3 mr-0.5" /> {delayedFlights.length} delayed
              </Badge>
            )}
          </div>
        </div>
        {/* Airport selector */}
        <div className="flex gap-1 mt-2">
          {["USM", "BKK"].map(apt => (
            <Button
              key={apt}
              variant={selectedAirport === apt ? "default" : "outline"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setSelectedAirport(apt)}
            >
              {apt === "USM" ? "🌴 Samui (USM)" : "🏙 Bangkok (BKK)"}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !flights?.length ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No flight data yet. Traffic data refreshes every 30 minutes.
          </p>
        ) : (
          <Tabs defaultValue="arrivals" className="w-full">
            <TabsList className="w-full grid grid-cols-2 mb-3">
              <TabsTrigger value="arrivals" className="text-xs gap-1">
                <PlaneLanding className="h-3.5 w-3.5" /> Arrivals ({arrivals.length})
              </TabsTrigger>
              <TabsTrigger value="departures" className="text-xs gap-1">
                <PlaneTakeoff className="h-3.5 w-3.5" /> Departures ({departures.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="arrivals" className="mt-0">
              <FlightList flights={arrivals} direction="arrival" />
            </TabsContent>
            <TabsContent value="departures" className="mt-0">
              <FlightList flights={departures} direction="departure" />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function FlightList({ flights, direction }: { flights: AirportTrafficFlight[]; direction: string }) {
  if (!flights.length) {
    return <p className="text-sm text-muted-foreground py-3 text-center">No {direction}s found today.</p>;
  }

  // Sort: linked first, then by time
  const sorted = [...flights].sort((a, b) => {
    if (a.linked_pickup_id && !b.linked_pickup_id) return -1;
    if (!a.linked_pickup_id && b.linked_pickup_id) return 1;
    const timeA = a.scheduled_arrival ?? a.scheduled_departure ?? "";
    const timeB = b.scheduled_arrival ?? b.scheduled_departure ?? "";
    return timeA.localeCompare(timeB);
  });

  return (
    <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
      {sorted.map(flight => (
        <FlightRow key={flight.id} flight={flight} direction={direction} />
      ))}
    </div>
  );
}

function FlightRow({ flight, direction }: { flight: AirportTrafficFlight; direction: string }) {
  const timeStr = direction === "arrival"
    ? flight.scheduled_arrival
    : flight.scheduled_departure;
  const time = timeStr ? new Date(timeStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

  const etaStr = flight.estimated_arrival;
  const eta = etaStr ? new Date(etaStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;

  const isLinked = !!flight.linked_pickup_id;
  const statusColor = STATUS_COLORS[flight.flight_status] ?? STATUS_COLORS.unknown;
  const statusEmoji = STATUS_EMOJI[flight.flight_status] ?? "—";

  const routeLabel = direction === "arrival"
    ? `${flight.departure_iata ?? "?"} → ${flight.arrival_iata ?? "?"}`
    : `${flight.departure_iata ?? "?"} → ${flight.arrival_iata ?? "?"}`;

  return (
    <div className={`flex items-center justify-between rounded-lg border p-2.5 text-sm transition-colors ${
      isLinked
        ? "border-primary/40 bg-primary/5 dark:bg-primary/10"
        : "hover:bg-accent/20"
    }`}>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium text-xs">{flight.flight_iata}</span>
          {flight.airline_name && (
            <span className="text-[11px] text-muted-foreground truncate">{flight.airline_name}</span>
          )}
          {isLinked && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge className="bg-primary text-primary-foreground text-[9px] px-1.5 py-0">
                    <Link2 className="h-2.5 w-2.5 mr-0.5" /> BOOKED
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  This flight is linked to a guest pickup
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>{routeLabel}</span>
          <span className="flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" /> {time}
          </span>
          {flight.delay_minutes > 0 && (
            <span className="text-orange-600 dark:text-orange-400">
              +{flight.delay_minutes}min{eta ? ` (ETA ${eta})` : ""}
            </span>
          )}
          {flight.terminal && <span>T{flight.terminal}</span>}
          {flight.gate && <span>Gate {flight.gate}</span>}
        </div>
      </div>
      <Badge className={`text-[10px] shrink-0 ml-2 ${statusColor}`}>
        {statusEmoji} {flight.flight_status}
      </Badge>
    </div>
  );
}
