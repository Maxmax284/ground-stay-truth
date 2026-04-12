import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { showForegroundNotification } from "@/components/ForegroundNotificationBanner";

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  reference_id: string | null;
  message: string;
  read: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Notification[];
    },
    refetchInterval: 30_000,
  });

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["notifications", user.id] });

          // Show foreground banner for real-time DB notifications
          const n = payload.new as any;
          if (n && document.visibilityState === "visible") {
            const typeLabels: Record<string, string> = {
              booking: "📋 Booking",
              payment: "💳 Payment",
              maintenance: "🔧 Maintenance",
              laundry: "👕 Laundry",
              message: "💬 Message",
              review: "⭐ Review",
              flight: "✈️ Flight",
              stay_essentials: "🏠 Stay Info",
            };
            showForegroundNotification({
              title: `Ground Stay — ${typeLabels[n.type] || "Notification"}`,
              body: n.message,
              type: n.type,
              referenceId: n.reference_id,
            });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, qc]);

  const unreadCount = useMemo(
    () => (query.data ?? []).filter((n) => !n.read).length,
    [query.data]
  );

  return { ...query, unreadCount };
}

export function useMarkNotificationRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["notifications", user?.id] });
      const prev = qc.getQueryData<Notification[]>(["notifications", user?.id]);
      qc.setQueryData<Notification[]>(["notifications", user?.id], (old) =>
        (old ?? []).map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notifications", user?.id], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Helper to insert a notification via backend function */
export async function createNotification(params: {
  user_id: string;
  type: string;
  reference_id?: string;
  message: string;
}) {
  await supabase.functions.invoke("create-notification", {
    body: { notifications: [params] },
  });
}

/** Batch helper for multi-recipient notifications */
export async function createNotifications(
  notifications: Array<{ user_id: string; type: string; reference_id?: string; message: string }>
) {
  if (notifications.length === 0) return;
  await supabase.functions.invoke("create-notification", {
    body: { notifications },
  });
}
