/**
 * ElevationBanner — loud, persistent indicator that the current session is
 * running with a temporary admin elevation. Shows a live countdown and a
 * one-tap way to close the window early.
 */
import { ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMyElevation } from "@/hooks/useAdminElevation";

export function ElevationBanner() {
  const { isActive, elevation, countdown, secondsLeft, revoke, isRevoking } = useMyElevation();

  if (!isActive || !elevation) return null;

  const urgent = secondsLeft <= 60;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs sm:text-sm ${
        urgent
          ? "border-destructive bg-destructive text-destructive-foreground"
          : "border-destructive/40 bg-destructive/10 text-destructive"
      }`}
    >
      <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="font-semibold uppercase tracking-wide">Admin elevation active</span>
      <span className="font-mono tabular-nums">{countdown} left</span>
      <span className="min-w-0 flex-1 truncate opacity-80">— {elevation.reason}</span>
      <Button
        size="sm"
        variant={urgent ? "secondary" : "outline"}
        className="h-7 shrink-0 px-2"
        disabled={isRevoking}
        onClick={() => revoke()}
      >
        <X className="mr-1 h-3 w-3" aria-hidden="true" />
        End now
      </Button>
    </div>
  );
}
