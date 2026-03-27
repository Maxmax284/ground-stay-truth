import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks/useNotifications";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import { formatDistanceToNow } from "date-fns";
import type { SoundName } from "@/lib/groundSounds";

const TYPE_ICONS: Record<string, string> = {
  booking: "📋",
  payment: "💳",
  maintenance: "🔧",
  laundry: "👕",
  override: "⚠️",
  stay_essentials: "🏠",
};

/** Dispatch a custom event when tapping an actionable notification type. */
function handleNotificationAction(type: string) {
  switch (type) {
    case "stay_essentials":
      window.dispatchEvent(
        new CustomEvent("ask-kru-glitch", {
          detail: { question: "Show me my stay essentials — WiFi, house rules, and emergency contacts." },
        })
      );
      break;
    case "booking":
      window.dispatchEvent(new CustomEvent("guest-portal-action", { detail: { tab: "bookings" } }));
      break;
    case "maintenance":
      window.dispatchEvent(new CustomEvent("guest-portal-action", { detail: { tab: "stay-support" } }));
      break;
    case "payment":
      window.dispatchEvent(new CustomEvent("guest-portal-action", { detail: { tab: "bookings" } }));
      break;
    case "laundry":
      window.dispatchEvent(new CustomEvent("guest-portal-action", { detail: { tab: "stay-support", section: "laundry" } }));
      break;
    default:
      break;
  }
}

/** Map notification types to sound names */
const TYPE_SOUNDS: Record<string, SoundName> = {
  booking: "booking_confirmed",
  payment: "payment",
  maintenance: "error",
  laundry: "message",
  stay_essentials: "check_in",
  override: "state_change",
};

export function NotificationBell() {
  const { t } = useTranslation();
  const { data: notifications, unreadCount } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const { play } = useSoundEffects();
  const [open, setOpen] = useState(false);
  const [showRead, setShowRead] = useState(false);
  const prevCountRef = useRef(unreadCount);

  // Play sound when a new notification arrives (unread count increases)
  useEffect(() => {
    if (unreadCount > prevCountRef.current && notifications?.length) {
      const newest = notifications.find((n) => !n.read);
      const soundName = TYPE_SOUNDS[newest?.type ?? ""] ?? "notification";
      play(soundName);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount, notifications, play]);

  const visibleNotifications = (notifications ?? []).filter(
    (n) => showRead || !n.read
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground animate-bounce-badge">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="text-sm font-semibold">{t("notifications.title")}</h4>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowRead((v) => !v)}
            >
              {showRead ? t("notifications.hideRead", "Hide read") : t("notifications.showRead", "Show read")}
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                {t("notifications.markAllRead")}
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="h-80">
          {visibleNotifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground animate-fade-up">
              {t("notifications.empty")}
            </div>
          ) : (
            <div className="divide-y">
              {visibleNotifications.map((n, i) => (
                <button
                  key={n.id}
                  className={`w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors flex items-start gap-3 ${!n.read ? "bg-primary/5" : ""}`}
                  onClick={() => {
                    if (!n.read) markRead.mutate(n.id);
                    handleNotificationAction(n.type);
                    setOpen(false);
                  }}
                >
                  <span className="text-base shrink-0 mt-0.5">{TYPE_ICONS[n.type] ?? "📌"}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${!n.read ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {n.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {!n.read && (
                    <div className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
