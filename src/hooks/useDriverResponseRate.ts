import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Did drivers actually reply, or just open the link?
 * Opened = the link was viewed at least once. Replied = at least one message
 * from the driver on that pickup. Purely observational — nothing is changed.
 */
export const RESPONSE_WINDOW_DAYS = 30;

export interface DriverResponseRate {
  sent: number;
  opened: number;
  replied: number;
  /** Replies as a share of opened links, 0–100. Null when nothing was opened. */
  rate: number | null;
}

export function computeResponseRate(opened: number, replied: number): number | null {
  if (opened <= 0) return null;
  return Math.round((Math.min(replied, opened) / opened) * 100);
}

function windowStart() {
  return new Date(Date.now() - RESPONSE_WINDOW_DAYS * 86_400_000).toISOString();
}

/** Rolling 30-day reply rate across every driver link the property sent. */
export function useDriverResponseRate(enabled = true) {
  return useQuery({
    queryKey: ["driver-response-rate", RESPONSE_WINDOW_DAYS],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<DriverResponseRate> => {
      const since = windowStart();
      const [linksRes, msgRes] = await Promise.all([
        (supabase.from("pickup_driver_links" as any) as any)
          .select("id, pickup_id, view_count")
          .gte("created_at", since),
        (supabase.from("pickup_driver_messages" as any) as any)
          .select("pickup_id")
          .eq("sender_type", "driver")
          .gte("created_at", since),
      ]);
      if (linksRes.error) throw linksRes.error;
      if (msgRes.error) throw msgRes.error;

      const links = (linksRes.data ?? []) as Array<{ pickup_id: string; view_count: number }>;
      const repliedPickups = new Set((msgRes.data ?? []).map((m: any) => m.pickup_id));
      const openedPickups = new Set(links.filter((l) => (l.view_count ?? 0) > 0).map((l) => l.pickup_id));
      const replied = [...openedPickups].filter((p) => repliedPickups.has(p)).length;
      return {
        sent: links.length,
        opened: openedPickups.size,
        replied,
        rate: computeResponseRate(openedPickups.size, replied),
      };
    },
  });
}

export type PickupDriverState = "no_link" | "not_opened" | "opened_no_reply" | "replied";

export interface PickupDriverResponse {
  state: PickupDriverState;
  lastViewedAt: string | null;
  lastDriverMessageAt: string | null;
  viewCount: number;
}

/** Where this one pickup stands: link sent, opened, or actually answered. */
export function usePickupDriverResponse(pickupId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["pickup-driver-response", pickupId],
    enabled: enabled && !!pickupId,
    refetchInterval: enabled && pickupId ? 30_000 : false,
    queryFn: async (): Promise<PickupDriverResponse> => {
      const [linkRes, msgRes] = await Promise.all([
        (supabase.from("pickup_driver_links" as any) as any)
          .select("view_count, last_viewed_at, created_at")
          .eq("pickup_id", pickupId)
          .order("created_at", { ascending: false })
          .limit(1),
        (supabase.from("pickup_driver_messages" as any) as any)
          .select("created_at")
          .eq("pickup_id", pickupId)
          .eq("sender_type", "driver")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      if (linkRes.error) throw linkRes.error;
      if (msgRes.error) throw msgRes.error;

      const link = (linkRes.data ?? [])[0] as { view_count: number; last_viewed_at: string | null } | undefined;
      const lastDriverMessageAt = ((msgRes.data ?? [])[0] as { created_at: string } | undefined)?.created_at ?? null;
      const viewCount = link?.view_count ?? 0;
      const state: PickupDriverState = !link
        ? "no_link"
        : lastDriverMessageAt
          ? "replied"
          : viewCount > 0
            ? "opened_no_reply"
            : "not_opened";
      return { state, lastViewedAt: link?.last_viewed_at ?? null, lastDriverMessageAt, viewCount };
    },
  });
}
