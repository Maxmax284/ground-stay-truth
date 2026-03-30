import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AutoAssignResult {
  available: boolean;
  unit_id?: string;
  unit_name?: string;
  available_count?: number;
  total_count?: number;
  error?: string;
}

export function useAutoAssignUnit(groupId: string | undefined, checkIn: string, checkOut: string) {
  return useQuery<AutoAssignResult>({
    queryKey: ["auto-assign-unit", groupId, checkIn, checkOut],
    enabled: !!groupId && !!checkIn && !!checkOut,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("auto-assign-unit", {
        body: { group_id: groupId, check_in: checkIn, check_out: checkOut },
      });
      if (error) throw error;
      return data as AutoAssignResult;
    },
    staleTime: 10_000,
  });
}

export function useUnitGroups() {
  return useQuery({
    queryKey: ["unit-groups-with-info"],
    queryFn: async () => {
      // Get groups
      const { data: groups, error: gErr } = await supabase
        .from("unit_groups")
        .select("id, name, description, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (gErr) throw gErr;

      // Get a representative unit per group for pricing/capacity info
      const { data: units, error: uErr } = await supabase
        .from("units")
        .select("id, group_id, base_price, capacity, min_nights, amenities, photos, cleaning_fee, weekend_price")
        .eq("is_active", true)
        .order("sort_order");
      if (uErr) throw uErr;

      // Count units per group
      return (groups ?? []).map((g) => {
        const groupUnits = (units ?? []).filter((u) => u.group_id === g.id);
        const rep = groupUnits[0];
        return {
          ...g,
          unitCount: groupUnits.length,
          base_price: rep?.base_price ?? 0,
          capacity: rep?.capacity ?? 2,
          min_nights: rep?.min_nights ?? 1,
          amenities: rep?.amenities ?? [],
          photos: rep?.photos ?? [],
          cleaning_fee: rep?.cleaning_fee ?? 0,
          weekend_price: rep?.weekend_price ?? null,
          representativeUnitId: rep?.id,
        };
      });
    },
  });
}
