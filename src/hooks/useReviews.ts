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
  reviewed_by: string | null;
  reviewed_at: string | null;
  guest_display_name: string | null;
  created_at: string;
  updated_at: string;
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

/** Submit a review (guest) */
export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (review: { booking_id: string; guest_id: string; rating: number; title: string; body: string; guest_display_name: string | null }) => {
      const { error } = await supabase.from("reviews" as any).insert(review as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
    },
  });
}

/** Approve a review (admin) */
export function useApproveReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reviewedBy }: { id: string; reviewedBy: string }) => {
      const { error } = await supabase
        .from("reviews" as any)
        .update({ status: "approved", reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews"] }),
  });
}

/** Reject a review (admin) */
export function useRejectReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reviewedBy, adminNote }: { id: string; reviewedBy: string; adminNote?: string }) => {
      const { error } = await supabase
        .from("reviews" as any)
        .update({ status: "rejected", reviewed_by: reviewedBy, reviewed_at: new Date().toISOString(), admin_note: adminNote ?? null } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews"] }),
  });
}

/** Delete a review (admin) */
export function useDeleteReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reviews" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews"] }),
  });
}
