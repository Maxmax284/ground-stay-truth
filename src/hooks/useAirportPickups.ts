import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useProperty } from "@/hooks/useProperty";

export type AssistMode = "healthy" | "degraded" | "manual_assist" | "recovery_pending";

export interface AirportPickup {
  id: string;
  booking_id: string;
  driver_id: string | null;
  status: string;
  fee: number;
  fee_override: boolean;
  fee_override_reason: string | null;
  fee_override_by: string | null;
  flight_number: string | null;
  international_flight_number: string | null;
  final_flight_confirmed: boolean;
  arrival_datetime: string | null;
  passenger_count: number;
  luggage_notes: string | null;
  special_instructions: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  confirmed_at: string | null;
  confirmed_airport: string | null;
  guest_landed_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
  // Assist mode fields
  assist_mode: AssistMode;
  assist_reason: string | null;
  assist_activated_at: string | null;
  assist_resolved_at: string | null;
  assist_activated_by: string | null;
  assist_resolved_by: string | null;
  // joined
  drivers?: { id: string; name: string; phone: string | null; whatsapp: string | null; vehicle_type: string | null; license_plate: string | null } | null;
}

export function useAirportPickup(bookingId: string | null) {
  return useQuery({
    queryKey: ["airport_pickup", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("airport_pickups" as any)
        .select("*, drivers(id, name, phone, whatsapp, vehicle_type, license_plate)")
        .eq("booking_id", bookingId!)
        .maybeSingle() as any);
      if (error) throw error;
      return data as AirportPickup | null;
    },
  });
}

export function useUpsertAirportPickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pickup: Partial<AirportPickup> & { booking_id: string }) => {
      const { data, error } = await (supabase
        .from("airport_pickups" as any)
        .upsert(pickup, { onConflict: "booking_id" })
        .select()
        .single() as any);
      if (error) throw error;
      return data as AirportPickup;
    },
    onSuccess: async (result, vars) => {
      qc.invalidateQueries({ queryKey: ["airport_pickup", vars.booking_id] });
      qc.invalidateQueries({ queryKey: ["todays_pickups"] });

      // Sync "confirm_domestic_flight" checklist item with final flight number
      if ("flight_number" in vars) {
        const finalFlight = vars.flight_number || (result as any)?.flight_number;
        try {
          await supabase
            .from("pre_arrival_checklist")
            .upsert(
              {
                booking_id: vars.booking_id,
                item_key: "confirm_domestic_flight",
                completed: !!finalFlight,
                completed_at: finalFlight ? new Date().toISOString() : null,
                data: finalFlight ? { flight_number: finalFlight } : null,
              },
              { onConflict: "booking_id,item_key" }
            );
          qc.invalidateQueries({ queryKey: ["pre_arrival_checklist", vars.booking_id] });
        } catch {
          // Non-critical — don't fail the pickup save
        }
      }
    },
  });
}

export function useUpdateAssistMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      booking_id: string;
      pickup_id: string;
      assist_mode: AssistMode;
      assist_reason?: string | null;
      activated_by?: string | null;
      resolved_by?: string | null;
    }) => {
      const updates: any = {
        booking_id: params.booking_id,
        assist_mode: params.assist_mode,
        assist_reason: params.assist_reason ?? null,
      };
      if (params.assist_mode === "manual_assist" && params.activated_by) {
        updates.assist_activated_at = new Date().toISOString();
        updates.assist_activated_by = params.activated_by;
      }
      if (params.assist_mode === "healthy" && params.resolved_by) {
        updates.assist_resolved_at = new Date().toISOString();
        updates.assist_resolved_by = params.resolved_by;
      }
      const { data, error } = await (supabase
        .from("airport_pickups" as any)
        .upsert(updates, { onConflict: "booking_id" })
        .select()
        .single() as any);
      if (error) throw error;
      return data as AirportPickup;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["airport_pickup", vars.booking_id] });
      qc.invalidateQueries({ queryKey: ["todays_pickups"] });
    },
  });
}

export function useTodaysPickups() {
  const today = format(new Date(), "yyyy-MM-dd");
  const { activePropertyId } = useProperty();
  return useQuery({
    queryKey: ["todays_pickups", today, activePropertyId],
    queryFn: async () => {
      const startOfDay = `${today}T00:00:00`;
      const endOfDay = `${today}T23:59:59`;
      let query = (supabase
        .from("airport_pickups" as any)
        .select("*, drivers(name, whatsapp, vehicle_type, license_plate), bookings!inner(id, check_in, guest_id, units(name), profiles!bookings_guest_id_profiles_fkey(full_name))")
        .neq("status", "cancelled")
        .neq("status", "completed")
        .or(`arrival_datetime.gte.${startOfDay},arrival_datetime.lte.${endOfDay},arrival_datetime.is.null`)
        .order("arrival_datetime", { ascending: true, nullsFirst: false }) as any);
      if (activePropertyId) query = query.eq("property_id", activePropertyId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).filter((p: any) => {
        if (p.arrival_datetime) {
          const d = p.arrival_datetime.substring(0, 10);
          return d === today;
        }
        return p.bookings?.check_in === today;
      }) as any[];
    },
  });
}

export async function logPickupAction(params: {
  bookingId: string;
  pickupId: string;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
}) {
  await supabase.from("stay_support_log").insert({
    booking_id: params.bookingId,
    request_type: "airport_pickup",
    request_id: params.pickupId,
    action: params.action,
    from_status: params.fromStatus ?? null,
    to_status: params.toStatus ?? null,
    note: params.note ?? null,
  });
}
