// Lightweight summary of unread staff replies for the floating Front Desk button.
// Independent of GuestPortal so it works on any guest screen.

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface GuestInboxSummary {
  unread: number;
  lastFromStaff: { content: string; created_at: string; booking_id: string } | null;
}

export function useGuestInboxSummary() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<GuestInboxSummary>({
    queryKey: ["guest-inbox-summary", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // Bookings owned by this guest
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("guest_id", user!.id);
      const ids = (bookings ?? []).map((b) => b.id);
      if (ids.length === 0) return { unread: 0, lastFromStaff: null };

      const { data: msgs } = await supabase
        .from("messages")
        .select("id, booking_id, content, created_at, sender_id, read_at, is_internal")
        .in("booking_id", ids)
        .eq("is_internal", false)
        .neq("sender_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);

      const list = msgs ?? [];
      const unread = list.filter((m: any) => !m.read_at).length;
      const last = list[0] ?? null;
      return {
        unread,
        lastFromStaff: last
          ? { content: (last as any).content ?? "", created_at: (last as any).created_at, booking_id: (last as any).booking_id }
          : null,
      };
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("guest-inbox-summary-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["guest-inbox-summary", user.id] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  return query;
}
