/**
 * Stage 4 — staff-side exceptions.
 *
 * Reads the open arrival conflicts across bookings and lets a human decide:
 * keep what the team entered, use the incoming reading, or mark it not
 * relevant. Accepting an incoming value is the ONLY path that writes a leg
 * field, and only ever on an explicit human tap.
 *
 * Nothing here writes bookings, payments, rooms, pickup status or check-in.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MERGEABLE_FIELDS } from "@/lib/journeyIntake";

export interface ExceptionBooking {
  id: string;
  check_in: string;
  state: string;
  manual_guest_name: string | null;
  manual_guest_phone: string | null;
  units: { name: string } | null;
  profiles: { full_name: string | null; phone: string | null } | null;
}

export interface ArrivalExceptionRow {
  id: string;
  booking_id: string;
  leg_id: string | null;
  field_name: string;
  existing_value: string | null;
  existing_source: string | null;
  incoming_value: string | null;
  incoming_source: string | null;
  severity: string;
  detected_at: string;
  bookings: ExceptionBooking | null;
}

/** Every open conflict a staff member is allowed to see, newest first. */
export function useArrivalExceptions() {
  return useQuery({
    queryKey: ["arrival-exceptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("arrival_conflicts")
        .select(
          `id, booking_id, leg_id, field_name, existing_value, existing_source, incoming_value, incoming_source, severity, detected_at,
           bookings(id, check_in, state, manual_guest_name, manual_guest_phone, units(name), profiles!bookings_guest_id_profiles_fkey(full_name, phone))`,
        )
        .eq("status", "open")
        .order("detected_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as ArrivalExceptionRow[];
    },
    refetchInterval: 120_000,
  });
}

export type ExceptionDecision = "kept_existing" | "accepted_incoming" | "not_applicable";

/**
 * Record the human decision. `accepted_incoming` applies the incoming value to
 * the leg first, stamping the leg with the source it came from, so the audit
 * trail shows who chose it and where the value originated.
 */
export function useDecideArrivalException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      row,
      decision,
      note,
    }: {
      row: ArrivalExceptionRow;
      decision: ExceptionDecision;
      note?: string;
    }) => {
      const { data: auth } = await supabase.auth.getUser();

      if (decision === "accepted_incoming") {
        if (!row.leg_id) throw new Error("This note is not attached to a travel leg.");
        if (!(MERGEABLE_FIELDS as readonly string[]).includes(row.field_name)) {
          throw new Error("That detail cannot be replaced automatically.");
        }
        const { error: legErr } = await supabase
          .from("journey_legs")
          .update({
            [row.field_name]: row.incoming_value,
            source: row.incoming_source ?? "staff_entered",
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", row.leg_id);
        if (legErr) throw legErr;
      }

      const { error } = await supabase
        .from("arrival_conflicts")
        .update({
          status: decision === "not_applicable" ? "dismissed" : "resolved",
          resolution: decision,
          note: note ?? null,
          resolved_at: new Date().toISOString(),
          resolved_by: auth.user?.id ?? null,
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arrival-exceptions"] });
      qc.invalidateQueries({ queryKey: ["arrival_conflicts"] });
      qc.invalidateQueries({ queryKey: ["journey_legs"] });
    },
  });
}

export interface PickupBrief {
  booking_id: string;
  flight_number: string | null;
  confirmed_airport: string | null;
  arrival_location_name: string | null;
  arrival_datetime: string | null;
  passenger_count: number | null;
  luggage_notes: string | null;
  special_instructions: string | null;
  guest_ready_at: string | null;
  collected_at: string | null;
  drivers: { name: string | null; license_plate: string | null } | null;
}

/** Pickup + driver details for the bookings on screen, for the driver brief. */
export function usePickupBriefs(bookingIds: string[]) {
  const key = [...new Set(bookingIds)].sort();
  return useQuery({
    queryKey: ["pickup-briefs", key],
    enabled: key.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("airport_pickups")
        .select(
          "booking_id, flight_number, confirmed_airport, arrival_location_name, arrival_datetime, passenger_count, luggage_notes, special_instructions, guest_ready_at, collected_at, drivers(name, license_plate)",
        )
        .in("booking_id", key);
      if (error) throw error;
      const map: Record<string, PickupBrief> = {};
      ((data ?? []) as unknown as PickupBrief[]).forEach((p) => {
        map[p.booking_id] = p;
      });
      return map;
    },
  });
}
