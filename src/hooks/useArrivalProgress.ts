import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ArrivalProgressAction = "guest_ready" | "collected";

/**
 * Stage 3 — guest progress track. Two deliberate human actions only:
 *  * guest_ready — the guest (or staff on their behalf) is out and waiting.
 *  * collected — staff/driver confirm the guest is physically with the driver.
 * Flight data can never trigger either. Nothing here touches booking state,
 * price, room or payments.
 */
export function useArrivalProgress() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ bookingId, action }: { bookingId: string; action: ArrivalProgressAction }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/arrival-progress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ booking_id: bookingId, action }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body.error || "Could not save that");
      return body as { ok: boolean; already?: boolean; at?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["airport_pickup"] });
      qc.invalidateQueries({ queryKey: ["arrivals-board"] });
      qc.invalidateQueries({ queryKey: ["guest-stay-summary-pickups"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
