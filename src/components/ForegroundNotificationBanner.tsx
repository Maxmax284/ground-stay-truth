import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { getNotificationPresentation } from "@/lib/notificationPresentation";

export interface ForegroundNotification {
  id: string;
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  type?: string;
  route?: string;
  referenceId?: string;
  timestamp?: number;
}

const TYPE_ROUTES: Record<string, string> = {
  booking: "/bookings",
  payment: "/bookings",
  maintenance: "/dashboard",
  laundry: "/dashboard",
  message: "/messages",
  review: "/dashboard",
  flight: "/dashboard",
  stay_essentials: "/guest",
};

const AUTO_DISMISS_MS = 5000;

export function ForegroundNotificationBanner() {
  const [queue, setQueue] = useState<ForegroundNotification[]>([]);
  const [current, setCurrent] = useState<ForegroundNotification | null>(null);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const navigate = useNavigate();

  // Listen for foreground push events from the service worker
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "FOREGROUND_PUSH") {
        const payload = event.data.payload as ForegroundNotification;
        setQueue((q) => [...q, { ...payload, id: payload.id || crypto.randomUUID(), timestamp: Date.now() }]);
      }
    };
    navigator.serviceWorker?.addEventListener("message", handler);

    // Also listen for custom events (for local test/welcome notifications)
    const customHandler = (e: Event) => {
      const detail = (e as CustomEvent<ForegroundNotification>).detail;
      setQueue((q) => [...q, { ...detail, id: detail.id || crypto.randomUUID(), timestamp: Date.now() }]);
    };
    window.addEventListener("gs-foreground-notification", customHandler);

    return () => {
      navigator.serviceWorker?.removeEventListener("message", handler);
      window.removeEventListener("gs-foreground-notification", customHandler);
    };
  }, []);

  // Process queue
  useEffect(() => {
    if (!current && queue.length > 0) {
      setCurrent(queue[0]);
      setQueue((q) => q.slice(1));
      setVisible(true);
      setExiting(false);
    }
  }, [current, queue]);

  // Auto-dismiss
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => dismiss(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [current]);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
      setCurrent(null);
    }, 300);
  }, []);

  const handleTap = useCallback(() => {
    if (!current) return;
    const route = current.route || TYPE_ROUTES[current.type || ""] || null;
    dismiss();
    if (route) {
      navigate(route);
    }
  }, [current, dismiss, navigate]);

  if (!current || !visible) return null;

  const emoji = getNotificationPresentation(current.type || current.tag || "").icon;

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-[9999] pointer-events-none",
        // iOS safe area
        "pt-[env(safe-area-inset-top,0px)]"
      )}
    >
      <div
        className={cn(
          "pointer-events-auto mx-2 mt-2 rounded-2xl",
          "bg-card/95 backdrop-blur-xl border border-border/60",
          "shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]",
          "dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_2px_8px_rgba(0,0,0,0.2)]",
          "transition-all duration-300 ease-out",
          exiting
            ? "opacity-0 -translate-y-full"
            : "opacity-100 translate-y-0 animate-in slide-in-from-top-full"
        )}
        onClick={handleTap}
        role="alert"
        aria-live="assertive"
      >
        <div className="flex items-start gap-3 px-4 py-3">
          {/* Icon */}
          <div className="flex-shrink-0 mt-0.5">
            {current.icon ? (
              <img
                src={current.icon}
                alt=""
                className="h-8 w-8 rounded-lg object-cover"
              />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-lg">
                {emoji}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground truncate">
                {current.title}
              </p>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                now
              </span>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
              {current.body}
            </p>
          </div>

          {/* Close */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              dismiss();
            }}
            className="flex-shrink-0 mt-0.5 p-1 rounded-full hover:bg-muted/80 transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 mx-4 mb-1.5 rounded-full bg-muted/40 overflow-hidden">
          <div
            className="h-full bg-primary/40 rounded-full"
            style={{
              animation: `gs-progress ${AUTO_DISMISS_MS}ms linear forwards`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Dispatch a foreground notification from within the app.
 * Used for test/welcome notifications when the app is in the foreground.
 */
export function showForegroundNotification(notification: Omit<ForegroundNotification, "id">) {
  window.dispatchEvent(
    new CustomEvent("gs-foreground-notification", {
      detail: { ...notification, id: crypto.randomUUID() },
    })
  );
}
