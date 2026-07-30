import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getVapidKey(): Promise<string | null> {
  const { data } = await supabase
    .from("policy_settings")
    .select("value")
    .eq("key", "vapid_public_key")
    .maybeSingle();
  if (data?.value) {
    const raw = typeof data.value === "string" ? data.value : (data.value as any).key ?? null;
    // Strip wrapping quotes if stored as JSON string
    return raw ? raw.replace(/^"|"$/g, "") : null;
  }
  return null;
}

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

function isIOS(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export type PushHealth =
  | "unsupported"
  | "needs-install" // iOS Safari in a browser tab — push only works once installed
  | "blocked"
  | "off"
  | "out-of-sync" // browser has a subscription the server doesn't know about (or vice versa)
  | "on";

export function usePushNotifications() {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [health, setHealth] = useState<PushHealth>("off");
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    const supported =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setIsSupported(supported);

    if (!supported) {
      // iOS only exposes PushManager inside the installed PWA.
      setHealth(isIOS() && !isStandaloneDisplay() ? "needs-install" : "unsupported");
      setLoading(false);
      return;
    }
    if (!user) {
      setLoading(false);
      return;
    }

    setPermission(Notification.permission);

    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 5000);

    navigator.serviceWorker.ready
      .then(async (reg) => {
        if (cancelled) return;
        clearTimeout(timeout);
        try {
          const sub = await reg.pushManager.getSubscription();
          const { data: rows } = await supabase
            .from("push_subscriptions")
            .select("id, endpoint, last_success_at, last_error")
            .eq("user_id", user.id);

          const serverRows = rows ?? [];
          const match = sub ? serverRows.find((r) => r.endpoint === sub.endpoint) : undefined;

          setIsSubscribed(!!match);
          setLastSuccessAt((match as any)?.last_success_at ?? null);
          setLastError((match as any)?.last_error ?? null);

          if (Notification.permission === "denied") setHealth("blocked");
          else if (match) setHealth("on");
          else if (sub || serverRows.length > 0) setHealth("out-of-sync");
          else setHealth("off");
        } catch {
          setHealth("off");
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          clearTimeout(timeout);
          setHealth(isStandaloneDisplay() ? "out-of-sync" : "off");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [user, refreshKey]);

  const subscribe = useCallback(async () => {
    if (!user || !isSupported) return false;

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setHealth("blocked");
        toast.error("Notification permission denied. Please enable it in your browser settings.");
        return false;
      }

      const vapidKey = await getVapidKey();
      if (!vapidKey) {
        toast.error(
          "Push notifications haven't been configured yet. An admin needs to set the VAPID public key in Settings → Integrations.",
        );
        return false;
      }

      const reg = await navigator.serviceWorker.ready;

      // Drop any stale subscription (e.g. from a previous VAPID key or the
      // old GroundStay build) before creating a fresh one.
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", existing.endpoint);
        await existing.unsubscribe().catch(() => {});
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      const json = sub.toJSON();
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh,
          auth: json.keys!.auth,
          user_agent: navigator.userAgent.slice(0, 300),
          platform: isIOS() ? "ios" : /android/i.test(navigator.userAgent) ? "android" : "desktop",
          standalone: isStandaloneDisplay(),
          failure_count: 0,
          last_error: null,
        },
        { onConflict: "user_id,endpoint" },
      );

      if (error) throw error;

      setIsSubscribed(true);
      setHealth("on");
      setLastError(null);
      toast.success("Push notifications enabled on this device 🔔");
      return true;
    } catch (err: any) {
      console.error("Push subscribe error:", err);
      toast.error("Failed to enable push notifications.");
      return false;
    }
  }, [user, isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!user) return;

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", user.id)
          .eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
      setHealth("off");
      toast.success("Push notifications disabled on this device.");
    } catch (err) {
      console.error("Push unsubscribe error:", err);
      toast.error("Failed to disable push notifications.");
    }
  }, [user]);

  /** Repair a device whose browser + server records drifted apart. */
  const reconnect = useCallback(async () => {
    await unsubscribe().catch(() => {});
    return await subscribe();
  }, [subscribe, unsubscribe]);

  /**
   * Real end-to-end test: goes out through the push service, so it proves
   * delivery works even when the app is closed.
   */
  const sendTestPush = useCallback(async () => {
    if (!user) return false;
    const { data, error } = await supabase.functions.invoke("send-push", {
      body: {
        user_ids: [user.id],
        title: "LMT CampStay — Test alert 🔔",
        body: "If this landed on your phone, real alerts will too.",
        source: "manual-test",
        data: { url: "/notifications", type: "test" },
      },
    });

    if (error) {
      toast.error("Test push failed to send. Try 'Reconnect this device'.");
      return false;
    }
    const sent = (data as any)?.sent ?? 0;
    if (sent > 0) {
      toast.success("Test alert sent — check your phone's notification tray.");
      refresh();
      return true;
    }
    toast.error(
      (data as any)?.total === 0
        ? "This account has no registered devices. Enable notifications first."
        : "The push service rejected the alert. Try 'Reconnect this device'.",
    );
    refresh();
    return false;
  }, [user, refresh]);

  return {
    isSupported,
    isSubscribed,
    loading,
    permission,
    health,
    lastSuccessAt,
    lastError,
    subscribe,
    unsubscribe,
    reconnect,
    sendTestPush,
    refresh,
  };
}
