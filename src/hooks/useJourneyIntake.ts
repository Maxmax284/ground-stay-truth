import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DraftLeg } from "@/lib/journeyIntake";

export interface JourneyEvidenceRow {
  id: string;
  booking_id: string;
  kind: string;
  uploader_role: string;
  extraction_status: string;
  booking_reference_masked: string | null;
  legs_created: number;
  conflicts_created: number;
  error_message: string | null;
  created_at: string;
}

/** Uploads a guest's travel evidence and a receipt of what was read from it. */
export function useJourneyEvidence(bookingId?: string) {
  return useQuery({
    queryKey: ["journey_evidence", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journey_evidence")
        .select("id, booking_id, kind, uploader_role, extraction_status, booking_reference_masked, legs_created, conflicts_created, error_message, created_at")
        .eq("booking_id", bookingId!)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as JourneyEvidenceRow[];
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, bookingId: string) {
  qc.invalidateQueries({ queryKey: ["journey_legs", bookingId] });
  qc.invalidateQueries({ queryKey: ["arrival_conflicts", bookingId] });
  qc.invalidateQueries({ queryKey: ["journey_evidence", bookingId] });
}

export interface SaveLegsResult {
  ok: boolean;
  created: number;
  updated: number;
  conflicts: number;
  needs_onward: boolean;
}

/** A person typed their journey. Server-side merge decides what is safe to write. */
export function useSaveJourneyLegs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, legs }: { bookingId: string; legs: DraftLeg[] }) => {
      const { data, error } = await supabase.functions.invoke("journey-intake", {
        body: { action: "save_legs", booking_id: bookingId, legs },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as SaveLegsResult;
    },
    onSuccess: (_d, vars) => invalidate(qc, vars.bookingId),
  });
}

export interface ExtractResult {
  ok: boolean;
  evidence_id: string;
  readable: boolean;
  legs_created: number;
  enriched: number;
  conflicts: number;
  needs_onward?: boolean;
  reason?: string;
}

/**
 * Upload a booking screenshot/confirmation and have it read. The file lands in
 * the guest's own booking folder; extraction only fills blanks.
 */
export function useUploadTravelEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, file, kind = "screenshot" }: { bookingId: string; file: File; kind?: string }) => {
      if (file.size > 8 * 1024 * 1024) throw new Error("That file is over 8 MB — try a screenshot instead.");
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${bookingId}/travel-evidence/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage.from("guest-documents").upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data, error } = await supabase.functions.invoke("journey-intake", {
        body: {
          action: "extract_evidence",
          booking_id: bookingId,
          storage_path: path,
          mime_type: file.type || "image/jpeg",
          file_size: file.size,
          kind,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as ExtractResult;
    },
    onSuccess: (_d, vars) => invalidate(qc, vars.bookingId),
  });
}
