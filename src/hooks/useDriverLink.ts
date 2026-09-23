import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mints an expiring, read-only driver link for ONE pickup.
 * Minting a new link retires any previous one for that pickup.
 */
export function useCreateDriverLink() {
  return useMutation({
    mutationFn: async ({ pickup_id, hours = 48 }: { pickup_id: string; hours?: number }) => {
      const { data, error } = await supabase.functions.invoke("driver-pickup", {
        body: { action: "create", pickup_id, hours },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const token = (data as any).token as string;
      return {
        token,
        url: `${window.location.origin}/driver/${token}`,
        expires_at: (data as any).expires_at as string,
      };
    },
  });
}
