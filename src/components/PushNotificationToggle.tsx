import { useState } from "react";
import { Bell, BellOff, BellRing, Smartphone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { showForegroundNotification } from "@/components/ForegroundNotificationBanner";

export function PushNotificationToggle() {
  const { isSupported, isSubscribed, loading, permission, subscribe, unsubscribe } = usePushNotifications();
  const [testing, setTesting] = useState(false);

  const handleTestNotification = async () => {
    setTesting(true);
    try {
      // Show via the unified foreground notification system
      showForegroundNotification({
        title: "Ground Stay — Test 🔔",
        body: "This is a test notification. If you're seeing this, push notifications are working on your device!",
        type: "test",
        route: "/settings",
      });
      toast.success("Test notification sent — check your device!");
    } catch (err: any) {
      console.error("Test notification error:", err);
      toast.error("Failed to show test notification: " + (err.message || "Unknown error"));
    } finally {
      setTesting(false);
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
            Push notifications require the installed PWA version of Ground Stay. Install the app to your home screen first, then enable notifications from within the app.
          </p>
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
            <Smartphone className="h-4 w-4 text-primary flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              <strong>iOS:</strong> Safari → Share → Add to Home Screen<br />
              <strong>Android:</strong> Chrome menu → Install app
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BellRing className="h-5 w-5 text-primary" />
          Push Notifications
          {isSubscribed && (
            <Badge variant="secondary" className="ml-auto text-xs">Active</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {isSubscribed
            ? "You'll receive alerts for new bookings, maintenance requests, and guest messages — even when the app is closed."
            : "Enable push notifications to get real-time alerts on this device for bookings, maintenance, and messages."}
        </p>

        {permission === "denied" && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-medium">Notifications blocked</p>
            <p className="mt-1 text-xs">
              You've blocked notifications for this site. To enable them, open your browser settings and allow notifications for Ground Stay.
            </p>
          </div>
        )}

        {isSubscribed ? (
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={unsubscribe} className="w-full">
              <BellOff className="h-4 w-4 mr-2" />
              Disable Notifications
            </Button>
            <Button
              variant="secondary"
              onClick={handleTestNotification}
              disabled={testing}
              className="w-full"
            >
              <Send className="h-4 w-4 mr-2" />
              {testing ? "Sending..." : "Send Test Notification"}
            </Button>
          </div>
        ) : (
          <Button
            onClick={async () => {
              const success = await subscribe();
              if (success) {
                // Fire welcome notification through unified foreground system
                showForegroundNotification({
                  title: "Welcome to Ground Stay Alerts 🔔",
                  body: "You're all set! You'll now receive real-time alerts for bookings, messages, maintenance updates, and more — even when the app is closed.",
                  type: "welcome",
                  route: "/",
                });
              }
            }}
            disabled={permission === "denied"}
            className="w-full"
          >
            <Bell className="h-4 w-4 mr-2" />
            Enable Push Notifications
          </Button>
        )}

        {!isSubscribed && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
            <Smartphone className="h-4 w-4 text-primary flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              For the best experience, install Ground Stay to your home screen first, then enable notifications.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
