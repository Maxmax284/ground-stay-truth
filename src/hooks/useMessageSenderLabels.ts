import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SenderLabel {
  display_name: string | null;
  is_staff: boolean;
  staff_label: string | null;
}

/**
 * Who wrote each message in a booking thread. Labelling only — a message from a
 * registered camp number reads as staff instead of an unknown guest.
 */
export function useMessageSenderLabels(bookingId: string | null) {
  return useQuery({
    queryKey: ["message-sender-labels", bookingId],
    enabled: !!bookingId,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, SenderLabel>> => {
      const { data, error } = await supabase.rpc("get_message_sender_labels", {
        _booking_id: bookingId!,
      });
      if (error) return {};
      const map: Record<string, SenderLabel> = {};
      for (const row of (data ?? []) as any[]) {
        if (!row.sender_id) continue;
        map[row.sender_id] = {
          display_name: row.display_name ?? null,
          is_staff: !!row.is_staff,
          staff_label: row.staff_label ?? null,
        };
      }
      return map;
    },
  });
}
