import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildArrivalSituation,
  type ArrivalSituation,
  type FlightFact,
  type JourneyLeg,
} from "@/lib/arrivalIntelligence";

export interface ArrivalConflict {
  id: string;
  booking_id: string;
  leg_id: string | null;
  field_name: string;
  existing_value: string | null;
  existing_source: string | null;
  incoming_value: string | null;
  incoming_source: string | null;
  severity: string;
  status: string;
  detected_at: string;
  note: string | null;
}

/** Ordered legs for a booking. */
export function useJourneyLegs(bookingId?: string) {
  return useQuery({
    queryKey: ["journey_legs", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journey_legs")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("leg_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as JourneyLeg[];
    },
  });
}

/** Shared flight facts by id — one row can serve many guests on the same aircraft. */
export function useFlightFacts(factIds: string[]) {
  const key = [...new Set(factIds)].sort();
  return useQuery({
    queryKey: ["flight_facts", key],
    enabled: key.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("flight_facts").select("*").in("id", key);
      if (error) throw error;
      const map: Record<string, FlightFact> = {};
      (data ?? []).forEach((f: any) => { map[f.id] = f as FlightFact; });
      return map;
    },
  });
}

export function useArrivalConflicts(bookingId?: string, openOnly = true) {
  return useQuery({
    queryKey: ["arrival_conflicts", bookingId, openOnly],
    enabled: !!bookingId,
    queryFn: async () => {
      let query = supabase
        .from("arrival_conflicts")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("detected_at", { ascending: false });
      if (openOnly) query = query.eq("status", "open");
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ArrivalConflict[];
    },
  });
}

/** Resolve a conflict. Explicit human decision; nothing auto-applies. */
export function useResolveArrivalConflict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, resolution, note }: { id: string; resolution: "kept_existing" | "accepted_incoming" | "manual_entry" | "not_applicable"; note?: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("arrival_conflicts")
        .update({
          status: resolution === "not_applicable" ? "dismissed" : "resolved",
          resolution,
          note: note ?? null,
          resolved_at: new Date().toISOString(),
          resolved_by: auth.user?.id ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arrival_conflicts"] });
    },
  });
}

export interface ArrivalIntelligenceResult {
  situation: ArrivalSituation | null;
  legs: JourneyLeg[];
  facts: Record<string, FlightFact>;
  conflicts: ArrivalConflict[];
  isLoading: boolean;
}

/**
 * Assemble the role-agnostic arrival situation for a booking.
 * Read-only: this never writes to pickups, bookings, money or rooms.
 */
export function useArrivalIntelligence(
  bookingId?: string,
  context?: {
    guestLandedAt?: string | null;
    guestReadyAt?: string | null;
    collectedAt?: string | null;
    checkedIn?: boolean;
    pickupRequested?: boolean;
    driverAssigned?: boolean;
    driverName?: string | null;
    driverPlate?: string | null;
    meetingPoint?: string | null;
  },
): ArrivalIntelligenceResult {
  const legsQuery = useJourneyLegs(bookingId);
  const legs = legsQuery.data ?? [];
  const factIds = legs.map((l) => l.flight_fact_id).filter((id): id is string => !!id);
  const factsQuery = useFlightFacts(factIds);
  const conflictsQuery = useArrivalConflicts(bookingId);

  const facts = factsQuery.data ?? {};
  const conflicts = conflictsQuery.data ?? [];

  const situation = useMemo(() => {
    if (!bookingId) return null;
    const finalFactId = legs.find((l) => l.is_final_leg)?.flight_fact_id ?? legs[legs.length - 1]?.flight_fact_id ?? null;
    return buildArrivalSituation({
      legs,
      facts,
      progress: {
        guestLandedAt: context?.guestLandedAt ?? null,
        guestReadyAt: context?.guestReadyAt ?? null,
        collectedAt: context?.collectedAt ?? null,
        checkedIn: context?.checkedIn ?? false,
      },
      openConflicts: conflicts.filter((c) => c.status === "open").length,
      driverAssigned: !!context?.driverAssigned,
      driverName: context?.driverName ?? null,
      driverPlate: context?.driverPlate ?? null,
      meetingPoint: context?.meetingPoint ?? null,
      pickupRequested: context?.pickupRequested ?? false,
      factLastCheckedAt: (finalFactId && facts[finalFactId]?.last_checked_at) || null,
    });
  }, [bookingId, legs, facts, conflicts, context]);

  return {
    situation,
    legs,
    facts,
    conflicts,
    isLoading: legsQuery.isLoading || factsQuery.isLoading || conflictsQuery.isLoading,
  };
}
