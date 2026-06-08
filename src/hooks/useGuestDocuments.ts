import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VerificationNotes {
  document_type?: string;
  issuing_country?: string;
  expiry_date?: string | null;
  is_expired?: boolean;
  holder_name_readable?: boolean;
  document_number_readable?: boolean;
  quality_issues?: string[];
  confidence?: "low" | "medium" | "high";
  summary?: string;
  error?: string;
}

export interface GuestDocument {
  id: string;
  booking_id: string;
  file_name: string;
  file_path: string;
  uploaded_by: string | null;
  created_at: string;
  verification_status: string | null;
  verification_notes: VerificationNotes | null;
  verified_at: string | null;
  document_type: string;
}

import type { DocumentType } from "@/lib/requiredDocuments";

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
      return (data as unknown as GuestDocument[]);
    },
  });
}

export function useUploadGuestDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, file, documentType = "passport" }: { bookingId: string; file: File; documentType?: DocumentType }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const ext = file.name.split(".").pop();
      const filePath = `${bookingId}/${crypto.randomUUID()}.${ext}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("guest-documents")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      // Record metadata with pending verification status
      const { data, error } = await supabase
        .from("guest_documents")
        .insert({
          booking_id: bookingId,
          file_name: file.name,
          file_path: filePath,
          uploaded_by: user?.id ?? null,
          document_type: documentType,
        } as any)
        .select()
        .single();
        .select()
        .single();
      if (error) throw error;

      // Fire-and-forget: trigger AI verification
      const docData = data as unknown as GuestDocument;
      supabase.functions
        .invoke("verify-document", {
          body: { documentId: docData.id, filePath },
        })
        .then(() => {
          // Refetch after a short delay to pick up AI results
          setTimeout(() => {
            qc.invalidateQueries({ queryKey: ["guestDocuments", bookingId] });
          }, 3000);
          setTimeout(() => {
            qc.invalidateQueries({ queryKey: ["guestDocuments", bookingId] });
          }, 8000);
        })
        .catch((err) => console.error("Verification trigger failed:", err));

      return docData;
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
      await supabase.storage.from("guest-documents").remove([filePath]);
      const { error } = await supabase.from("guest_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["guestDocuments", vars.bookingId] });
    },
  });
}
