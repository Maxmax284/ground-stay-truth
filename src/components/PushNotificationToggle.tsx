import { useState } from "react";
import { Bell, BellOff, BellRing, Smartphone, Send, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

export function PushNotificationToggle() {
  const {
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
  } = usePushNotifications();
  const [testing, setTesting] = useState(false);
  const [fixing, setFixing] = useState(false);

  const handleTestNotification = async () => {
    setTesting(true);
    try {
      await sendTestPush();
    } catch (err: any) {
      toast.error("Test failed: " + (err?.message || "Unknown error"));
    } finally {
      setTesting(false);
    }
  };

  const handleReconnect = async () => {
    setFixing(true);
    try {
      await reconnect();
    } finally {
      setFixing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Push Notifications
          </CardTitle>
        </CardHeader>
        <CardContent><Skeleton className="h-10 w-full" /></CardContent>
      </Card>
    );
  }

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BellOff className="h-5 w-5 text-muted-foreground" />
            Push Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {health === "needs-install"
              ? "On iPhone, alerts only work after you add CampStay to your home screen. Install it, open the app icon, then come back here and turn alerts on."
              : "This browser can't receive phone alerts. Install LMT CampStay to your home screen and open it from the app icon."}
          </p>
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
            <Smartphone className="h-4 w-4 text-primary flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              <strong>iPhone:</strong> Safari → Share → Add to Home Screen<br />
              <strong>Android:</strong> Chrome menu → Install app
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const headline =
    health === "on"
      ? "Alerts are on for this device."
      : health === "blocked"
      ? "Your phone is blocking alerts from CampStay."
      : health === "out-of-sync"
      ? "This device is half-connected — alerts won't arrive until you reconnect."
      : "Alerts are off for this device.";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BellRing className="h-5 w-5 text-primary" />
          Push Notifications
          <Badge
            variant={health === "on" ? "secondary" : "outline"}
            className="ml-auto text-xs"
          >
            {health === "on"
              ? "Active"
              : health === "out-of-sync"
              ? "Needs reconnect"
              : health === "blocked"
              ? "Blocked"
              : "Off"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-foreground">{headline}</p>
        <p className="text-sm text-muted-foreground">
          {isSubscribed
            ? "You'll get alerts for new bookings, payments, maintenance, and guest messages — even when the app is closed."
            : "Turn this on to get real-time alerts on this phone for bookings, payments, maintenance, and messages."}
        </p>

        {isSubscribed && (
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <div>
              Last alert delivered to this device:{" "}
              <span className="font-medium text-foreground">
                {timeAgo(lastSuccessAt) ?? "none yet — send a test"}
              </span>
            </div>
            {lastError && (
              <div className="text-destructive">Last problem reported: {lastError}</div>
            )}
          </div>
        )}

        {permission === "denied" && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-medium flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> Notifications blocked
            </p>
            <p className="mt-1 text-xs">
              Your phone is blocking CampStay alerts. Open your phone's settings for this app (or
              the browser's site settings) and allow notifications, then come back and tap enable.
            </p>
          </div>
        )}

        {health === "out-of-sync" && (
          <div className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            This phone was registered on an older version of the app. Tap{" "}
            <strong>Reconnect this device</strong> once and alerts will start arriving again.
          </div>
        )}

        <div className="flex flex-col gap-2">
          {isSubscribed ? (
            <>
              <Button
                variant="secondary"
                onClick={handleTestNotification}
                disabled={testing}
                className="w-full"
              >
                <Send className="h-4 w-4 mr-2" />
                {testing ? "Sending…" : "Send Test Alert to This Device"}
              </Button>
              <Button variant="outline" onClick={handleReconnect} disabled={fixing} className="w-full">
                <RefreshCw className={`h-4 w-4 mr-2 ${fixing ? "animate-spin" : ""}`} />
                Reconnect this device
              </Button>
              <Button variant="ghost" onClick={unsubscribe} className="w-full">
                <BellOff className="h-4 w-4 mr-2" />
                Turn Alerts Off
              </Button>
            </>
          ) : health === "out-of-sync" ? (
            <Button onClick={handleReconnect} disabled={fixing} className="w-full">
              <RefreshCw className={`h-4 w-4 mr-2 ${fixing ? "animate-spin" : ""}`} />
              Reconnect this device
            </Button>
          ) : (
            <Button onClick={subscribe} disabled={permission === "denied"} className="w-full">
              <Bell className="h-4 w-4 mr-2" />
              Turn On Alerts
            </Button>
          )}
        </div>

        {!isSubscribed && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
            <Smartphone className="h-4 w-4 text-primary flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Best results: install LMT CampStay to your home screen first, open it from the app
              icon, then turn alerts on.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
