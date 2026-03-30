import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AirportTrafficFlight {
  id: string;
  flight_iata: string;
  airline_name: string | null;
  departure_iata: string | null;
  arrival_iata: string | null;
  departure_airport: string | null;
  arrival_airport: string | null;
  scheduled_departure: string | null;
  scheduled_arrival: string | null;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  flight_status: string;
  delay_minutes: number;
  terminal: string | null;
  gate: string | null;
  flight_date: string;
  direction: "arrival" | "departure";
  airport_iata: string;
  linked_pickup_id: string | null;
  last_checked_at: string;
}

export function useAirportTraffic(airportIata?: string) {
  const today = new Date().toISOString().split("T")[0];

  return useQuery({
    queryKey: ["airport_traffic", today, airportIata],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      let query = (supabase
        .from("airport_traffic" as any)
        .select("*")
        .eq("flight_date", today)
        .order("scheduled_arrival", { ascending: true, nullsFirst: false }) as any);

      if (airportIata) {
        query = query.eq("airport_iata", airportIata);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AirportTrafficFlight[];
    },
  });
}
