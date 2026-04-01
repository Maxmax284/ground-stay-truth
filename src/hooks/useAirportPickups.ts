import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

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
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["airport_pickup", vars.booking_id] });
      qc.invalidateQueries({ queryKey: ["todays_pickups"] });
    },
  });
}

export function useTodaysPickups() {
  const today = format(new Date(), "yyyy-MM-dd");
  return useQuery({
    queryKey: ["todays_pickups", today],
    queryFn: async () => {
      // Query by arrival_datetime date OR booking check_in date
      const startOfDay = `${today}T00:00:00`;
      const endOfDay = `${today}T23:59:59`;
      const { data, error } = await (supabase
        .from("airport_pickups" as any)
        .select("*, drivers(name, whatsapp, vehicle_type, license_plate), bookings!inner(id, check_in, guest_id, units(name), profiles!bookings_guest_id_profiles_fkey(full_name))")
        .neq("status", "cancelled")
        .neq("status", "completed")
        .or(`arrival_datetime.gte.${startOfDay},arrival_datetime.lte.${endOfDay},arrival_datetime.is.null`)
        .order("arrival_datetime", { ascending: true, nullsFirst: false }) as any);
      if (error) throw error;
      // Filter: if arrival_datetime is null, fall back to check_in matching today
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
