import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { AirportTrafficFlight } from "@/hooks/useAirportTraffic";

/**
 * Fallback for Flight Forecast: when airport-wide scan data is unavailable,
 * fetch cached flight_tracking rows for today's pickups and map them to
 * the same AirportTrafficFlight shape used by the widget.
 */
export function usePickupFlightsFallback(enabled: boolean) {
  const today = format(new Date(), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["pickup_flights_fallback", today],
    enabled,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      // 1. Get today's pickups that have a flight number
      const startOfDay = `${today}T00:00:00`;
      const endOfDay = `${today}T23:59:59`;

      const { data: pickups, error: pickupErr } = await (supabase
        .from("airport_pickups" as any)
        .select("id, flight_number, arrival_datetime, booking_id")
        .not("flight_number", "is", null)
        .neq("status", "cancelled") as any);

      if (pickupErr) throw pickupErr;

      // Filter to today
      const todayPickups = (pickups ?? []).filter((p: any) => {
        if (p.arrival_datetime) {
          return p.arrival_datetime.substring(0, 10) === today;
        }
        return true; // include if no arrival_datetime set
      });

      if (!todayPickups.length) return [] as AirportTrafficFlight[];

      const pickupIds = todayPickups.map((p: any) => p.id);

      // 2. Get cached flight_tracking data for those pickups
      const { data: tracks, error: trackErr } = await (supabase
        .from("flight_tracking" as any)
        .select("*")
        .in("pickup_id", pickupIds) as any);

      if (trackErr) throw trackErr;

      // 3. Map flight_tracking → AirportTrafficFlight shape
      return (tracks ?? []).map((ft: any): AirportTrafficFlight => ({
        id: ft.id,
        flight_iata: ft.flight_number,
        airline_name: ft.airline_name,
        departure_iata: ft.departure_iata,
        arrival_iata: ft.arrival_iata,
        departure_airport: ft.departure_airport,
        arrival_airport: ft.arrival_airport,
        scheduled_departure: ft.scheduled_departure,
        scheduled_arrival: ft.scheduled_arrival,
        estimated_arrival: ft.estimated_arrival,
        actual_arrival: ft.actual_arrival,
        flight_status: ft.flight_status ?? "unknown",
        delay_minutes: ft.delay_minutes ?? 0,
        terminal: ft.terminal,
        gate: ft.gate,
        flight_date: today,
        direction: "arrival" as const,
        airport_iata: ft.arrival_iata ?? "USM",
        linked_pickup_id: ft.pickup_id,
        last_checked_at: ft.last_checked_at,
      }));
    },
  });
}
