import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PickupMessageSender = "driver" | "guest" | "staff";

export interface PickupMessage {
  id: string;
  pickup_id: string;
  booking_id: string;
  sender_type: PickupMessageSender;
  sender_user_id: string | null;
  content: string;
  read_by_guest_at: string | null;
  read_by_staff_at: string | null;
  read_by_driver_at: string | null;
  created_at: string;
}

export function usePickupConversation(pickupId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["pickup-conversation", pickupId],
    enabled: enabled && !!pickupId,
    refetchInterval: enabled ? 10_000 : false,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("pickup_driver_messages" as any)
        .select("id, pickup_id, booking_id, sender_type, sender_user_id, content, read_by_guest_at, read_by_staff_at, read_by_driver_at, created_at")
        .eq("pickup_id", pickupId)
        .order("created_at", { ascending: true }) as any);
      if (error) throw error;
      return (data ?? []) as PickupMessage[];
    },
  });
}

export function useSendPickupMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pickupId, content }: { pickupId: string; content: string }) => {
      const body = content.trim();
      if (!body || body.length > 1000) throw new Error("Message must be between 1 and 1,000 characters.");
      const { data, error } = await supabase.functions.invoke("driver-pickup", {
        body: { action: "authenticated_send", pickup_id: pickupId, content: body },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return (data as any).message as PickupMessage;
    },
    onSuccess: (message) => {
      queryClient.invalidateQueries({ queryKey: ["pickup-conversation", message.pickup_id] });
      queryClient.invalidateQueries({ queryKey: ["pickup-conversations"] });
    },
  });
}
