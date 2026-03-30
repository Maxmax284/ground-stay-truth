import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface FlightTracking {
  id: string;
  pickup_id: string;
  flight_number: string;
  airline_name: string | null;
  departure_airport: string | null;
  departure_iata: string | null;
  arrival_airport: string | null;
  arrival_iata: string | null;
  scheduled_departure: string | null;
  estimated_departure: string | null;
  actual_departure: string | null;
  scheduled_arrival: string | null;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  flight_status: string;
  delay_minutes: number;
  terminal: string | null;
  gate: string | null;
  last_checked_at: string;
  created_at: string;
  updated_at: string;
}

export const FLIGHT_STATUS_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  scheduled: { label: "Scheduled", color: "bg-muted text-muted-foreground", emoji: "📅" },
  in_air: { label: "In Air", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", emoji: "✈️" },
  landed: { label: "Landed", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", emoji: "✅" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", emoji: "❌" },
  diverted: { label: "Diverted", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", emoji: "⚠️" },
  incident: { label: "Incident", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", emoji: "🚨" },
  not_found: { label: "Not Found", color: "bg-muted text-muted-foreground", emoji: "❓" },
  unknown: { label: "Unknown", color: "bg-muted text-muted-foreground", emoji: "—" },
};

/** Fetch cached flight tracking data for multiple pickup IDs */
export function useFlightTrackingBatch(pickupIds: string[]) {
  return useQuery({
    queryKey: ["flight_tracking_batch", pickupIds],
    enabled: pickupIds.length > 0,
    refetchInterval: 5 * 60 * 1000, // re-read cache every 5 min
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("flight_tracking" as any)
        .select("*")
        .in("pickup_id", pickupIds) as any);
      if (error) throw error;
      // Index by pickup_id
      const map: Record<string, FlightTracking> = {};
      (data ?? []).forEach((ft: FlightTracking) => { map[ft.pickup_id] = ft; });
      return map;
    },
  });
}

/** Check (or refresh) flight status via edge function */
export function useCheckFlightStatus() {
  const { session } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ pickup_id, flight_number, force_refresh }: {
      pickup_id: string;
      flight_number: string;
      force_refresh?: boolean;
    }) => {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-flight-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ pickup_id, flight_number, force_refresh }),
        }
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "Flight check failed");
      }
      return resp.json() as Promise<{ flight: FlightTracking; source: string; found?: boolean }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flight_tracking_batch"] });
    },
  });
}
