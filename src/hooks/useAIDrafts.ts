/**
 * BUSINESS-CRITICAL — AI draft approval queue.
 *
 * The deep-ops agent never executes anything. It writes proposals into
 * `ai_action_drafts`; a human approves or rejects them here. Approving a draft
 * records the decision plus an override-audit row so the trail shows who
 * accepted the AI's suggestion. Approval does NOT auto-execute the action —
 * staff still perform it through the normal tools (Plan -> Approve -> Execute).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logOverrideEvent } from "@/lib/overrideAudit";

export type AIDraftStatus = "pending" | "approved" | "rejected" | "applied" | "expired";

export interface AIDraft {
  id: string;
  created_by_user_id: string | null;
  action_type: string;
  summary: string;
  rationale: string | null;
  payload: Record<string, unknown> | null;
  booking_id: string | null;
  property_id: string | null;
  status: AIDraftStatus;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export const AI_DRAFT_ACTION_LABELS: Record<string, string> = {
  extend_stay: "Extend stay",
  change_dates: "Change dates",
  change_room: "Change room",
  request_payment: "Request payment",
  apply_discount: "Apply discount",
  assign_housekeeping: "Assign housekeeping",
  contact_guest: "Contact guest",
  flag_booking: "Flag booking",
  add_internal_note: "Add internal note",
  other: "Other",
};

export function aiDraftActionLabel(actionType: string): string {
  return AI_DRAFT_ACTION_LABELS[actionType] ?? actionType.replace(/_/g, " ");
}

export function useAIDrafts(status: AIDraftStatus | "all" = "pending", limit = 50) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const drafts = useQuery({
    queryKey: ["ai-action-drafts", status, limit],
    enabled: !!user,
    queryFn: async (): Promise<AIDraft[]> => {
      let q = supabase
        .from("ai_action_drafts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AIDraft[];
    },
  });

  const pendingCount = useQuery({
    queryKey: ["ai-action-drafts", "pending-count"],
    enabled: !!user,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("ai_action_drafts")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const review = useMutation({
    mutationFn: async (input: {
      draft: AIDraft;
      decision: Exclude<AIDraftStatus, "pending" | "expired">;
      note?: string;
    }) => {
      const { draft, decision, note } = input;
      const { data, error } = await supabase
        .from("ai_action_drafts")
        .update({
          status: decision,
          review_note: note?.trim() || null,
          reviewed_by_user_id: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", draft.id)
        .select("id");
      if (error) throw error;
      // RLS blocks the update silently (no error, no rows) when the ops security
      // code window is closed — say so plainly instead of looking like a no-op.
      if (!data || data.length === 0) {
        throw new Error(
          "Could not save that decision. Enter the ops security code in Settings → Ops and try again.",
        );
      }

      await logOverrideEvent({
        actionType: `ai_draft_${decision}`,
        targetType: "ai_action_draft",
        targetId: draft.id,
        bookingId: draft.booking_id,
        beforeState: { status: draft.status },
        afterState: { status: decision },
        reason: note?.trim() || null,
        metadata: { action_type: draft.action_type, summary: draft.summary },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-action-drafts"] });
      queryClient.invalidateQueries({ queryKey: ["override-audit"] });
    },
  });

  return {
    drafts,
    pendingCount: pendingCount.data ?? 0,
    review: review.mutateAsync,
    isReviewing: review.isPending,
  };
}
