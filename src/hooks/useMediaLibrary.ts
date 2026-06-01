import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_FOLDERS = ["Exterior", "Interior", "Amenities", "Common Areas"] as const;
export const UNCATEGORIZED = "Uncategorized";

export type MediaAsset = {
  id: string;
  storage_path: string;
  original_filename: string | null;
  folder: string;
  caption: string | null;
  alt_text: string | null;
  tags: string[];
  property_id: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

export function useMediaAssets() {
  return useQuery({
    queryKey: ["media-library-assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_library_assets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MediaAsset[];
    },
  });
}

export function useUpsertMediaAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<MediaAsset> & { storage_path: string }) => {
      const { data, error } = await supabase
        .from("media_library_assets")
        .upsert(row, { onConflict: "storage_path" })
        .select()
        .single();
      if (error) throw error;
      return data as MediaAsset;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media-library-assets"] }),
  });
}

export function useUpdateMediaAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MediaAsset> & { id: string }) => {
      const { data, error } = await supabase
        .from("media_library_assets")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as MediaAsset;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media-library-assets"] }),
  });
}

export function useBulkUpdateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, folder }: { ids: string[]; folder: string }) => {
      const { error } = await supabase
        .from("media_library_assets")
        .update({ folder })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media-library-assets"] }),
  });
}

export function useDeleteMediaAssets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (paths: string[]) => {
      const { error: sErr } = await supabase.storage.from("unit-photos").remove(paths);
      if (sErr) throw sErr;
      const { error } = await supabase
        .from("media_library_assets")
        .delete()
        .in("storage_path", paths);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media-library-assets"] }),
  });
}
