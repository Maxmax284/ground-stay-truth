import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

export function useDrivers(activeOnly = false) {
  return useQuery({
    queryKey: ["drivers", activeOnly],
    queryFn: async () => {
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
  return useMutation({
    mutationFn: async (driver: Omit<Driver, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await (supabase.from("drivers" as any).insert(driver).select().single() as any);
      if (error) throw error;
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
