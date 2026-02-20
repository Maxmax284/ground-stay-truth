import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const CHECKLIST_ITEMS = [
  { key: "confirm_arrival_time", label: "Confirm arrival time" },
  { key: "upload_id", label: "Upload ID / Passport" },
  { key: "review_checkin_time", label: "Review check-in time" },
  { key: "camp_rules_ack", label: "Camp rules acknowledgment" },
  { key: "emergency_contact", label: "Emergency contact confirmation" },
] as const;

export type ChecklistItemKey = typeof CHECKLIST_ITEMS[number]["key"];

export interface ChecklistItem {
  id: string;
  booking_id: string;
  item_key: string;
  completed: boolean;
  completed_at: string | null;
  data: any;
  created_at: string;
  updated_at: string;
}

export function usePreArrivalChecklist(bookingId: string | null) {
  return useQuery({
    queryKey: ["pre_arrival_checklist", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pre_arrival_checklist")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("item_key");
      if (error) throw error;
      return data as ChecklistItem[];
    },
  });
}

export function useToggleChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      bookingId,
      itemKey,
      completed,
      data,
    }: {
      bookingId: string;
      itemKey: string;
      completed: boolean;
      data?: any;
    }) => {
      // Upsert
      const { error } = await supabase
        .from("pre_arrival_checklist")
        .upsert(
          {
            booking_id: bookingId,
            item_key: itemKey,
            completed,
            completed_at: completed ? new Date().toISOString() : null,
            data: data ?? null,
          },
          { onConflict: "booking_id,item_key" }
        );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pre_arrival_checklist", vars.bookingId] });
    },
  });
}

export function getChecklistProgress(items: ChecklistItem[] | undefined): {
  completed: number;
  total: number;
  percentage: number;
  isComplete: boolean;
} {
  const total = CHECKLIST_ITEMS.length;
  const completed = CHECKLIST_ITEMS.filter((ci) =>
    items?.some((i) => i.item_key === ci.key && i.completed)
  ).length;
  return {
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    isComplete: completed === total,
  };
}
