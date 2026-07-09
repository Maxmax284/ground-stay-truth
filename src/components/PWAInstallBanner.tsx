import { useState, useEffect } from "react";
import { X, Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Already installed as PWA
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Detect iOS (no beforeinstallprompt support) — includes iPad on iPadOS
    const ios =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(ios);

    const android = /android/i.test(navigator.userAgent);
    setIsAndroid(android);
    // Check if previously dismissed this session
    if (sessionStorage.getItem("pwa-banner-dismissed")) {
      setDismissed(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("pwa-banner-dismissed", "1");
  };

  // Don't show if already installed, dismissed, or on desktop without prompt
  if (isStandalone || dismissed) return null;
  if (!isIOS && !isAndroid && !deferredPrompt) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 pb-safe animate-in slide-in-from-bottom duration-500">
      <div className="max-w-md mx-auto rounded-2xl border bg-card shadow-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-foreground">
              Install <span className="font-stat uppercase tracking-tight">LMT CampStay</span>
            </h3>

            <p className="text-xs text-muted-foreground mt-0.5">
              Add to your home screen for quick access to your stay info, even offline.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 rounded-full hover:bg-muted transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {isIOS ? (
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
            <Download className="h-4 w-4 text-primary flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Tap the <span className="font-semibold text-foreground">Share</span> button in Safari, then{" "}
              <span className="font-semibold text-foreground">Add to Home Screen</span>.
            </p>
          </div>
        ) : deferredPrompt ? (
          <Button onClick={handleInstall} size="sm" className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Install App
          </Button>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
            <Download className="h-4 w-4 text-primary flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Tap the <span className="font-semibold text-foreground">menu</span> (⋮) in your browser, then{" "}
              <span className="font-semibold text-foreground">Install app</span>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
