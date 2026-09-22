import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, addDays } from "date-fns";

export interface IntelLeg {
  id: string;
  leg_order: number;
  leg_type: string | null;
  marketed_flight_number: string | null;
  operating_flight_number: string | null;
  marketed_carrier: string | null;
  operating_carrier: string | null;
  from_code: string | null;
  to_code: string | null;
  scheduled_departure: string | null;
  scheduled_arrival: string | null;
  leg_status: string | null;
  is_final_leg: boolean | null;
  source: string | null;
  confidence: number | null;
  flight_fact_id: string | null;
}

export interface IntelStageEvent {
  id: string;
  stage: string;
  triggered_by: string | null;
  fired_at: string;
}

export interface IntelConflict {
  id: string;
  field_name: string;
  existing_value: string | null;
  existing_source: string | null;
  incoming_value: string | null;
  incoming_source: string | null;
  severity: string | null;
  status: string;
  detected_at: string;
  resolution: string | null;
  resolved_at: string | null;
}

export interface IntelBookingRow {
  booking_id: string;
  guest_name: string;
  unit_name: string | null;
  state: string;
  check_in: string;
  check_out: string;
  pickup: {
    id: string;
    confirmed_airport: string | null;
    arrival_datetime: string | null;
    guest_landed_at: string | null;
    guest_ready_at: string | null;
    collected_at: string | null;
    driver_name: string | null;
  } | null;
  legs: IntelLeg[];
  stages: IntelStageEvent[];
  conflicts: IntelConflict[];
  openConflicts: number;
}

/**
 * One read behind the arrival intelligence screen: every arriving stay with the
 * travel legs on file, what disagrees, and the stamped sequence of who said what.
 * Strictly read-only — decisions are still taken by a person, one at a time.
 */
export function useArrivalIntelBoard(daysAhead = 14) {
  return useQuery({
    queryKey: ["arrival-intel-board", daysAhead],
    refetchInterval: 120_000,
    queryFn: async (): Promise<IntelBookingRow[]> => {
      const from = format(subDays(new Date(), 3), "yyyy-MM-dd");
      const to = format(addDays(new Date(), daysAhead), "yyyy-MM-dd");

      const { data: bookings, error } = await (supabase
        .from("bookings")
        .select(
          "id, state, check_in, check_out, manual_guest_name, manual_guest_email, units(name), profiles:guest_id(full_name)",
        )
        .gte("check_out", from)
        .lte("check_in", to)
        .not("state", "in", '("cancelled")')
        .order("check_in", { ascending: true }) as any);
      if (error) throw error;

      const ids = (bookings ?? []).map((b: any) => b.id);
      if (ids.length === 0) return [];

      const [legsRes, stagesRes, conflictsRes, pickupsRes] = await Promise.all([
        (supabase
          .from("journey_legs")
          .select("*")
          .in("booking_id", ids)
          .order("leg_order", { ascending: true }) as any),
        (supabase
          .from("guest_arrival_stage_log")
          .select("id, booking_id, stage, triggered_by, fired_at")
          .in("booking_id", ids)
          .order("fired_at", { ascending: true }) as any),
        (supabase
          .from("arrival_conflicts")
          .select(
            "id, booking_id, field_name, existing_value, existing_source, incoming_value, incoming_source, severity, status, detected_at, resolution, resolved_at",
          )
          .in("booking_id", ids)
          .order("detected_at", { ascending: false }) as any),
        (supabase
          .from("airport_pickups")
          .select(
            "id, booking_id, confirmed_airport, arrival_datetime, guest_landed_at, guest_ready_at, collected_at, drivers(name)",
          )
          .in("booking_id", ids) as any),
      ]);

      const legs = (legsRes.data ?? []) as any[];
      const stages = (stagesRes.data ?? []) as any[];
      const conflicts = (conflictsRes.data ?? []) as any[];
      const pickups = (pickupsRes.data ?? []) as any[];
      const pickupByBooking = new Map(pickups.map((p) => [p.booking_id, p]));

      return (bookings ?? []).map((b: any) => {
        const pickup = pickupByBooking.get(b.id) ?? null;
        const rowConflicts = conflicts.filter((c) => c.booking_id === b.id) as IntelConflict[];
        return {
          booking_id: b.id,
          guest_name: b.profiles?.full_name || b.manual_guest_name || "Unnamed guest",
          unit_name: b.units?.name ?? null,
          state: b.state,
          check_in: b.check_in,
          check_out: b.check_out,
          pickup: pickup
            ? {
                id: pickup.id,
                confirmed_airport: pickup.confirmed_airport ?? null,
                arrival_datetime: pickup.arrival_datetime ?? null,
                guest_landed_at: pickup.guest_landed_at ?? null,
                guest_ready_at: pickup.guest_ready_at ?? null,
                collected_at: pickup.collected_at ?? null,
                driver_name: pickup.drivers?.name ?? null,
              }
            : null,
          legs: legs.filter((l) => l.booking_id === b.id) as IntelLeg[],
          stages: stages.filter((s) => s.booking_id === b.id) as IntelStageEvent[],
          conflicts: rowConflicts,
          openConflicts: rowConflicts.filter((c) => c.status === "open").length,
        };
      });
    },
  });
}
