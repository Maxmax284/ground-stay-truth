import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, UserCircle2 } from "lucide-react";

// Baked at build time in vite.config.ts
declare const __APP_BUILD_DATE__: string;

/**
 * Thin identity + build strip.
 *
 * Exists because staff kept comparing screens across phones/browsers and seeing
 * different numbers: it was almost always either a different account (a guest
 * login sees no staff data) or an older cached build. This makes both facts
 * visible at a glance, and gives a one-tap hard refresh that drops caches and
 * re-registers the service worker.
 */
export function SessionIdentityStrip() {
  const { user, role } = useAuth();
  const [busy, setBusy] = useState(false);

  const buildDate = (() => {
    try {
      return new Date(__APP_BUILD_DATE__).toLocaleString("en-GB", {
        timeZone: "Asia/Bangkok",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "unknown";
    }
  })();

  const refresh = async () => {
    setBusy(true);
    try {
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch {
      /* refresh anyway */
    } finally {
      window.location.reload();
    }
  };

  const noStaffAccess = !role || role === "guest";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
        <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium truncate max-w-[200px]">{user?.email ?? "not signed in"}</span>
        <Badge variant={noStaffAccess ? "destructive" : "secondary"} className="text-[10px]">
          {role ?? "no role"}
        </Badge>
        <span className="text-muted-foreground">Build {buildDate}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={refresh}
          disabled={busy}
          className="ml-auto h-7 gap-1.5 text-xs"
        >
          <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
          Update app
        </Button>
      </div>
      {noStaffAccess && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          This account has no staff access, so bookings, arrivals and departures will all read
          zero even though the camp has active bookings. Ask an admin to give it a staff role,
          or sign in with your staff account.
        </div>
      )}
    </div>
  );
}

