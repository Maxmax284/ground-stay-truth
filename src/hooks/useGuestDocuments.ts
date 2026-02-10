import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GuestDocument {
  id: string;
  booking_id: string;
  file_name: string;
  file_path: string;
  uploaded_by: string | null;
  created_at: string;
}

export function useGuestDocuments(bookingId: string | null) {
  return useQuery({
    queryKey: ["guestDocuments", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guest_documents")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as GuestDocument[];
    },
  });
}

export function useUploadGuestDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, file }: { bookingId: string; file: File }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const ext = file.name.split(".").pop();
      const filePath = `${bookingId}/${crypto.randomUUID()}.${ext}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("guest-documents")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      // Record metadata
      const { data, error } = await supabase
        .from("guest_documents")
        .insert({
          booking_id: bookingId,
          file_name: file.name,
          file_path: filePath,
          uploaded_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["guestDocuments", vars.bookingId] });
    },
  });
}

export function useDeleteGuestDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, filePath, bookingId }: { id: string; filePath: string; bookingId: string }) => {
      // Delete from storage
      await supabase.storage.from("guest-documents").remove([filePath]);
      // Delete metadata
      const { error } = await supabase.from("guest_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["guestDocuments", vars.bookingId] });
    },
  });
}
