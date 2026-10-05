import { useState, useEffect } from "react";
import { Bell, Share, PlusSquare, X, CheckCircle2, MessageSquare, Plane, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { showForegroundNotification } from "@/components/ForegroundNotificationBanner";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "gs_guest_notif_dismissed_at";
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/**
 * Guest-facing notification enrollment prompt.
 * Uses benefit-based language, not technical "push notification" framing.
 * Shows at contextually appropriate moments in the guest journey.
 */
export function GuestStayUpdatesPrompt({ className }: { className?: string }) {
  const { isSupported, isSubscribed, permission, subscribe, loading, health } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);

  // Check cooldown on mount
  useEffect(() => {
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < COOLDOWN_MS) {
        setDismissed(true);
      } else {
        localStorage.removeItem(DISMISS_KEY);
      }
    }
  }, []);

  const handleDismissInstall = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setDismissed(true);
  };

  // iPhone in a Safari tab: alerts only exist once the portal is on the
  // Home Screen, so show the steps instead of a button that can't work.
  if (!loading && !dismissed && health === "needs-install") {
    return (
      <div className={cn("guest-notice-card relative min-w-0 max-w-full overflow-hidden rounded-lg border border-border/60 bg-card p-4 shadow-sm", className)}>
        <button
          onClick={handleDismissInstall}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted/80 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground pr-6">Get stay alerts on your iPhone</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              iPhone only sends alerts from apps on your Home Screen. It takes three taps:
            </p>
            <ol className="mt-2 space-y-1.5 text-xs text-foreground">
              <li className="flex min-w-0 items-start gap-2">
                <span className="font-semibold">1.</span> Tap <Share className="h-3.5 w-3.5 inline" aria-label="Share" /> Share at the bottom of Safari
              </li>
              <li className="flex min-w-0 items-start gap-2">
                <span className="font-semibold">2.</span> Choose <PlusSquare className="h-3.5 w-3.5 inline" aria-hidden /> Add to Home Screen
              </li>
              <li className="flex min-w-0 items-start gap-2">
                <span className="font-semibold">3.</span> Open CampStay from the new icon and tap Enable Stay Updates
              </li>
            </ol>
            <p className="text-[11px] text-muted-foreground mt-2">You'll still get every update by email either way.</p>
          </div>
        </div>
      </div>
    );
  }

  // Don't show if: loading, already subscribed, not supported, dismissed, or permission permanently denied
  if (loading || isSubscribed || !isSupported || dismissed || permission === "denied") {
    return null;
  }

  // Success state — show briefly after enabling
  if (justEnabled) {
    return (
      <div className={cn(
        "guest-notice-card min-w-0 max-w-full overflow-hidden rounded-lg border border-primary/20 bg-primary/5 p-4 animate-fade-up",
        className
      )}>
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              You're all set!
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              You'll now get instant updates about your booking, arrival, and messages.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleEnable = async () => {
    setEnrolling(true);
    try {
      const success = await subscribe();
      if (success) {
        setJustEnabled(true);
        showForegroundNotification({
          title: "Stay Updates Enabled ✨",
          body: "You'll now receive instant updates about your booking, arrival details, and messages from staff.",
          type: "welcome",
          route: "/guest",
        });
        // Auto-hide after a few seconds
        setTimeout(() => setJustEnabled(false), 5000);
      }
    } finally {
      setEnrolling(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setDismissed(true);
  };

  return (
    <div className={cn(
      "guest-notice-card relative min-w-0 max-w-full overflow-hidden rounded-lg border border-border/60 bg-card p-4 shadow-sm animate-fade-up",
      className
    )}>
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted/80 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
          <Bell className="h-5 w-5 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground pr-6">
            Get instant updates about your stay
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Receive real-time alerts for booking confirmations, arrival updates, staff messages, and more — delivered right to your device.
          </p>

          {/* Benefit chips */}
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
              <CalendarCheck className="h-3 w-3" /> Booking updates
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
              <Plane className="h-3 w-3" /> Arrival alerts
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
              <MessageSquare className="h-3 w-3" /> Staff messages
            </span>
          </div>

          {/* CTA */}
          <Button
            onClick={handleEnable}
            disabled={enrolling}
            size="sm"
            className="mt-3 w-full sm:w-auto"
          >
            <Bell className="h-3.5 w-3.5 mr-1.5" />
            {enrolling ? "Setting up..." : "Enable Stay Updates"}
          </Button>
        </div>
      </div>
    </div>
  );
}
