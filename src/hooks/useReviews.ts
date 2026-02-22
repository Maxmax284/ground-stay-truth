import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Review {
  id: string;
  booking_id: string;
  guest_id: string;
  rating: number;
  title: string;
  body: string;
  status: string;
  admin_note: string | null;
  admin_response: string | null;
  admin_response_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  guest_display_name: string | null;
  stay_check_in: string | null;
  stay_check_out: string | null;
  stay_unit_name: string | null;
  stay_nights: number | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  review_id: string;
  action: string;
  performed_by: string;
  reason: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

/** Privacy-safe display name: "John Doe" → "John D." */
export function maskDisplayName(name: string | null): string {
  if (!name) return "Guest";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/** Check if a booking is within the review time window (24h–90d after checkout) */
export function getReviewTimeGate(checkOut: string): { canReview: boolean; reason?: string; reviewStartDate?: Date } {
  const checkout = new Date(checkOut);
  const now = new Date();
  const reviewStart = new Date(checkout.getTime() + 24 * 60 * 60 * 1000);
  const reviewEnd = new Date(checkout.getTime() + 90 * 24 * 60 * 60 * 1000);

  if (now < reviewStart) {
    return { canReview: false, reason: "too_early", reviewStartDate: reviewStart };
  }
  if (now > reviewEnd) {
    return { canReview: false, reason: "expired" };
  }
  return { canReview: true };
}

/** Fetch approved reviews for the public /stay page */
export function useApprovedReviews() {
  return useQuery({
    queryKey: ["reviews", "approved"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews" as any)
        .select("*")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as unknown as Review[];
    },
  });
}

/** Fetch reviews for a specific guest (own reviews) */
export function useGuestReviews(guestId?: string) {
  return useQuery({
    queryKey: ["reviews", "guest", guestId],
    enabled: !!guestId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews" as any)
        .select("*")
        .eq("guest_id", guestId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Review[];
    },
  });
}

/** Fetch all reviews for admin management */
export function useAllReviews(statusFilter?: string) {
  return useQuery({
    queryKey: ["reviews", "all", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("reviews" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (statusFilter && statusFilter !== "all") {
        q = q.eq("status", statusFilter);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Review[];
    },
  });
}

/** Fetch audit log for a specific review */
export function useReviewAuditLog(reviewId?: string) {
  return useQuery({
    queryKey: ["review-audit-log", reviewId],
    enabled: !!reviewId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_audit_log" as any)
        .select("*")
        .eq("review_id", reviewId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AuditLogEntry[];
    },
  });
}

/** Insert an audit log entry */
async function insertAuditLog(entry: {
  review_id: string;
  action: string;
  performed_by: string;
  reason?: string;
  metadata?: Record<string, any>;
}) {
  await supabase.from("review_audit_log" as any).insert({
    review_id: entry.review_id,
    action: entry.action,
    performed_by: entry.performed_by,
    reason: entry.reason ?? null,
    metadata: entry.metadata ?? null,
  } as any);
}

/** Submit a review (guest) — snapshots booking metadata */
export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (review: {
      booking_id: string;
      guest_id: string;
      rating: number;
      title: string;
      body: string;
      guest_display_name: string | null;
      stay_check_in?: string;
      stay_check_out?: string;
      stay_unit_name?: string;
      stay_nights?: number;
    }) => {
      const { error } = await supabase.from("reviews" as any).insert(review as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
    },
  });
}

/** Approve a review (admin) — writes audit log */
export function useApproveReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reviewedBy, reviewSnapshot }: { id: string; reviewedBy: string; reviewSnapshot?: Record<string, any> }) => {
      const { error } = await supabase
        .from("reviews" as any)
        .update({ status: "approved", reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
      await insertAuditLog({
        review_id: id,
        action: "approved",
        performed_by: reviewedBy,
        metadata: reviewSnapshot,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["review-audit-log"] });
    },
  });
}

/** Reject a review (admin) — requires reason, writes audit log */
export function useRejectReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reviewedBy, adminNote, reviewSnapshot }: { id: string; reviewedBy: string; adminNote: string; reviewSnapshot?: Record<string, any> }) => {
      const { error } = await supabase
        .from("reviews" as any)
        .update({ status: "rejected", reviewed_by: reviewedBy, reviewed_at: new Date().toISOString(), admin_note: adminNote } as any)
        .eq("id", id);
      if (error) throw error;
      await insertAuditLog({
        review_id: id,
        action: "rejected",
        performed_by: reviewedBy,
        reason: adminNote,
        metadata: reviewSnapshot,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["review-audit-log"] });
    },
  });
}

/** Fetch the review for a specific booking */
export function useBookingReview(bookingId?: string) {
  return useQuery({
    queryKey: ["reviews", "booking", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews" as any)
        .select("*")
        .eq("booking_id", bookingId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Review | null;
    },
  });
}

/** Respond to a review (admin) — writes audit log + notifies guest */
export function useRespondToReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, performedBy, response }: { id: string; performedBy: string; response: string | null }) => {
      const isRemoval = response === null;
      const { error } = await supabase
        .from("reviews" as any)
        .update({
          admin_response: response,
          admin_response_at: response ? new Date().toISOString() : null,
        } as any)
        .eq("id", id);
      if (error) throw error;
      await insertAuditLog({
        review_id: id,
        action: isRemoval ? "response_removed" : "responded",
        performed_by: performedBy,
        metadata: { admin_response: response },
      });
      // Fire-and-forget notification for new/updated responses (not removals)
      if (!isRemoval) {
        supabase.functions.invoke("notify-review-response", {
          body: { review_id: id, admin_response: response },
        }).catch((err) => console.warn("Notification failed (non-blocking):", err));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["review-audit-log"] });
    },
  });
}

/** Delete a review (admin) — writes audit log before deletion */
export function useDeleteReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, performedBy, reviewSnapshot }: { id: string; performedBy: string; reviewSnapshot?: Record<string, any> }) => {
      await insertAuditLog({
        review_id: id,
        action: "deleted",
        performed_by: performedBy,
        metadata: reviewSnapshot,
      });
      const { error } = await supabase.from("reviews" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["review-audit-log"] });
    },
  });
}
