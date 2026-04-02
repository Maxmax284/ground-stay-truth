import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProperty } from "@/hooks/useProperty";

export interface Driver {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  vehicle_type: string | null;
  license_plate: string | null;
  photo_url: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch drivers scoped to the active property via driver_property_assignments.
 * When no property is active, returns all drivers (umbrella view).
 */
export function useDrivers(activeOnly = false) {
  const { activePropertyId } = useProperty();
  return useQuery({
    queryKey: ["drivers", activeOnly, activePropertyId],
    queryFn: async () => {
      if (activePropertyId) {
        // Get driver IDs assigned to this property
        const { data: assignments, error: aErr } = await (supabase
          .from("driver_property_assignments" as any)
          .select("driver_id")
          .eq("property_id", activePropertyId) as any);
        if (aErr) throw aErr;

        const driverIds = (assignments ?? []).map((a: any) => a.driver_id);
        if (driverIds.length === 0) return [];

        let q = supabase.from("drivers" as any).select("*").in("id", driverIds).order("name");
        if (activeOnly) q = q.eq("is_active", true);
        const { data, error } = await q;
        if (error) throw error;
        return data as unknown as Driver[];
      }

      // No property selected — show all drivers
      let q = supabase.from("drivers" as any).select("*").order("name");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Driver[];
    },
  });
}

export function useCreateDriver() {
  const qc = useQueryClient();
  const { activePropertyId } = useProperty();
  return useMutation({
    mutationFn: async (driver: Omit<Driver, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await (supabase.from("drivers" as any).insert(driver).select().single() as any);
      if (error) throw error;

      // Auto-assign to active property
      if (activePropertyId && data) {
        await (supabase.from("driver_property_assignments" as any).insert({
          driver_id: (data as any).id,
          property_id: activePropertyId,
        }) as any);
      }

      return data as Driver;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drivers"] }),
  });
}

export function useUpdateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Driver> & { id: string }) => {
      const { data, error } = await (supabase.from("drivers" as any).update(updates).eq("id", id).select().single() as any);
      if (error) throw error;
      return data as Driver;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drivers"] }),
  });
}
