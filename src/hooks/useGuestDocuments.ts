import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logOverrideEvent } from "@/lib/overrideAudit";

export interface VerificationNotes {
  document_type?: string;
  is_identity_document?: boolean;
  /** True when the AI is confident the guest uploaded the wrong kind of document. */
  wrong_document?: boolean;
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

/**
 * Staff review status for a guest identity document.
 * Advisory only — none of these values block check-in or any other action.
 */
export type DocumentReviewStatus =
  | "uploaded"
  | "reviewed"
  | "accepted"
  | "needs_replacement"
  | "superseded";

export const REVIEW_STATUS_LABELS: Record<DocumentReviewStatus, string> = {
  uploaded: "Uploaded — needs review",
  reviewed: "Reviewed",
  accepted: "Accepted",
  needs_replacement: "Needs replacement",
  superseded: "Replaced",
};

/** Plain-English reasons staff can attach when asking for a replacement. */
export const REPLACEMENT_REASONS = [
  "Wrong document",
  "Blurry image",
  "Missing passport photo page",
  "Expired document",
  "Unreadable details",
  "Wrong guest",
  "Missing required page",
] as const;


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
  review_status: DocumentReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
  review_note: string | null;
  used_for_tm30: boolean;
  tm30_marked_by: string | null;
  tm30_marked_at: string | null;
  superseded: boolean;
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
      if (error) throw error;

      // Fire-and-forget: trigger AI verification
      const docData = data as unknown as GuestDocument;
      supabase.functions
        .invoke("verify-document", {
          body: { documentId: docData.id, filePath, expectedType: documentType },
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

// ---------------------------------------------------------------------------
// Sensitive-document access. Identity documents live in a PRIVATE bucket.
// Every staff view/download mints a short-lived signed URL and writes an audit
// row. We never persist or display raw storage paths or signed URLs.
// ---------------------------------------------------------------------------

const SIGNED_URL_TTL_SECONDS = 120;

async function logDocumentAccess(opts: {
  documentId: string;
  bookingId: string;
  action: "view" | "download" | "review" | "tm30";
  detail?: string;
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    await supabase.from("guest_document_access_log").insert({
      document_id: opts.documentId,
      booking_id: opts.bookingId,
      actor_id: user.id,
      actor_role: (roleRow as any)?.role ?? null,
      action: opts.action,
      detail: opts.detail ?? null,
    } as any);
  } catch (err) {
    // Never block the staff member on a logging failure.
    console.error("Document access log failed");
  }
}

/** Mint a short-lived signed URL for a document and record the access. */
export function useOpenGuestDocument() {
  return useMutation({
    mutationFn: async ({
      doc,
      action,
    }: {
      doc: GuestDocument;
      action: "view" | "download";
    }) => {
      const { data, error } = await supabase.storage
        .from("guest-documents")
        .createSignedUrl(doc.file_path, SIGNED_URL_TTL_SECONDS,
          action === "download" ? { download: doc.file_name } : undefined);
      if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? "Could not open document");
      }
      await logDocumentAccess({
        documentId: doc.id,
        bookingId: doc.booking_id,
        action,
        detail: doc.document_type,
      });
      return data.signedUrl;
    },
  });
}

/** Staff review action: reviewed / accepted / needs replacement. */
export function useReviewGuestDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      doc,
      status,
      reason,
      note,
    }: {
      doc: GuestDocument;
      status: DocumentReviewStatus;
      reason?: string | null;
      note?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("guest_documents")
        .update({
          review_status: status,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
          review_reason: reason ?? null,
          review_note: note ?? null,
        } as any)
        .eq("id", doc.id);
      if (error) throw error;
      await logDocumentAccess({
        documentId: doc.id,
        bookingId: doc.booking_id,
        action: "review",
        detail: [status, reason, note].filter(Boolean).join(" — "),
      });

      // Attribution — a staff decision on somebody's ID is an override worth naming.
      await logOverrideEvent({
        actionType: "guest_document_review_override",
        targetType: "guest_document",
        targetId: doc.id,
        bookingId: doc.booking_id,
        beforeState: { review_status: (doc as any).review_status ?? null },
        afterState: { review_status: status },
        reason: reason ?? note ?? null,
        metadata: { document_type: (doc as any).document_type ?? null },
      });

    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["guestDocuments", vars.doc.booking_id] });
    },
  });
}

/** Toggle the "details copied for TM30" operational flag. */
export function useMarkDocumentTm30() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ doc, used }: { doc: GuestDocument; used: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("guest_documents")
        .update({
          used_for_tm30: used,
          tm30_marked_by: used ? user?.id ?? null : null,
          tm30_marked_at: used ? new Date().toISOString() : null,
        } as any)
        .eq("id", doc.id);
      if (error) throw error;
      await logDocumentAccess({
        documentId: doc.id,
        bookingId: doc.booking_id,
        action: "tm30",
        detail: used ? "marked used for TM30" : "cleared TM30 flag",
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["guestDocuments", vars.doc.booking_id] });
    },
  });
}

export interface DocumentAccessLogRow {
  id: string;
  document_id: string | null;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  detail: string | null;
  created_at: string;
}

/** Staff-only access trail for a booking's documents. */
export function useDocumentAccessLog(bookingId: string | null, enabled = false) {
  return useQuery({
    queryKey: ["guestDocumentAccessLog", bookingId],
    enabled: !!bookingId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guest_document_access_log")
        .select("id, document_id, actor_id, actor_role, action, detail, created_at")
        .eq("booking_id", bookingId!)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as unknown as DocumentAccessLogRow[];
    },
  });
}

/**
 * Lightweight per-booking ID status for list views.
 * Returns a map of booking_id -> worst-case status to surface in the list.
 */
export function useBookingDocumentFlags(bookingIds: string[]) {
  const key = [...bookingIds].sort().join(",");
  return useQuery({
    queryKey: ["bookingDocumentFlags", key],
    enabled: bookingIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guest_documents")
        .select("booking_id, review_status, superseded, created_at")
        .in("booking_id", bookingIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map: Record<string, DocumentReviewStatus> = {};
      for (const row of (data ?? []) as any[]) {
        // First row per booking is the newest upload.
        if (!map[row.booking_id]) {
          map[row.booking_id] = (row.review_status ?? "uploaded") as DocumentReviewStatus;
        }
      }
      return map;
    },
  });
}
