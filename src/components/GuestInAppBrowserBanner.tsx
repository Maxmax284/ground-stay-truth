import { useState } from "react";
import { ExternalLink, Copy, Check, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { detectInAppBrowser, logGuestPortalEvent } from "@/lib/guestPortalTelemetry";

/**
 * In-app browser warning.
 *
 * Instagram / Facebook / LINE / TikTok webviews routinely block the Stripe
 * redirect and third-party cookies. Guests then see a "stuck" screen with no
 * explanation. This banner names the problem and gives them a one-tap way out
 * into Safari or Chrome.
 *
 * Presentation only — it never blocks the portal.
 */
export function GuestInAppBrowserBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const { isInApp, label } = detectInAppBrowser();

  if (!isInApp || dismissed) return null;

  const url = typeof window !== "undefined" ? window.location.href : "";
  const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const targetBrowser = isIOS ? "Safari" : "Chrome";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied — paste it into " + targetBrowser);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — long-press the address bar instead");
    }
    logGuestPortalEvent({
      event: "guest_in_app_browser_detected",
      status: "warn",
      severity: "warning",
      component: "GuestInAppBrowserBanner",
      action: "copy_link",
      message: `Copied portal link out of ${label}`,
    });
  };

  const handleOpen = () => {
    logGuestPortalEvent({
      event: "guest_in_app_browser_detected",
      status: "warn",
      severity: "warning",
      component: "GuestInAppBrowserBanner",
      action: "open_external",
      message: `Tried to reopen portal in ${targetBrowser} from ${label}`,
    });
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="rounded-lg border border-amber-400/60 bg-amber-50/70 dark:bg-amber-950/25 p-3 sm:p-4 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <Smartphone className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            You're browsing inside {label || "an app"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Payments and ID uploads often fail in in-app browsers. Reopen this page in {targetBrowser} before you pay
            your deposit or upload your passport.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="gap-1.5" onClick={handleOpen}>
          <ExternalLink className="h-3.5 w-3.5" />
          Open in {targetBrowser}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          Copy link
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
          Dismiss
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        If the button does nothing: tap the ••• menu at the top of the screen and choose "Open in browser".
      </p>
    </div>
  );
}
