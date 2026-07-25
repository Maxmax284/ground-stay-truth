import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const INSTALL_STAMP_KEY = "lmt-campstay:install-stamp";
const DISMISS_KEY = "lmt-campstay:reinstall-dismissed";
const EXPECTED_START_URL = "/index";

/**
 * When the app is launched in standalone (installed PWA) mode, we stamp
 * localStorage with the start_url that was active at first launch. If a later
 * build changes the expected start_url (as when GroundStay → LMT CampStay
 * bumped it from "/" to "/index"), the stamp won't match and we surface a
 * one-time guided reinstall prompt.
 */
export function ReinstallPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;

    if (!isStandalone) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;

    const existing = localStorage.getItem(INSTALL_STAMP_KEY);
    const landedAtLegacyRoot =
      window.location.pathname === "/" || window.location.pathname === "";

    // If the standalone shell launched at "/" (the old cached start_url),
    // the installed icon is still pointing at the pre-update target — prompt
    // regardless of whether a stamp was ever written.
    if (landedAtLegacyRoot) {
      setOpen(true);
      return;
    }

    if (!existing) {
      // First launch on this build from the new start_url — record identity.
      localStorage.setItem(INSTALL_STAMP_KEY, EXPECTED_START_URL);
      return;
    }

    if (existing !== EXPECTED_START_URL) {
      setOpen(true);
    }
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  };

  const handleAcknowledgedReinstall = () => {
    // User says they've reinstalled — refresh the stamp so we don't nag again.
    localStorage.setItem(INSTALL_STAMP_KEY, EXPECTED_START_URL);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleDismiss())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Reinstall CampStay once
          </DialogTitle>
          <DialogDescription className="text-left space-y-2 pt-2">
            <span className="block">
              This installed app was captured before the latest CampStay update, so it may still open the
              public site instead of your dashboard.
            </span>
            <span className="block font-medium text-foreground pt-1">One-time steps:</span>
            <ol className="list-decimal ml-5 space-y-1 text-sm">
              <li>Delete the current CampStay icon from your home screen.</li>
              <li>
                Open <span className="font-semibold">lmtcampstay.com</span> in Safari (iPhone) or Chrome
                (Android).
              </li>
              <li>Share → Add to Home Screen (iPhone) or menu → Install app (Android).</li>
              <li>Open the new icon — it should land on your dashboard.</li>
            </ol>
            <span className="block pt-1 text-xs">
              Future updates flow through automatically after this one-time reinstall.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" size="sm" onClick={handleDismiss}>
            <X className="h-4 w-4 mr-1.5" />
            Remind me later
          </Button>
          <Button size="sm" onClick={handleAcknowledgedReinstall}>
            I've reinstalled
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
