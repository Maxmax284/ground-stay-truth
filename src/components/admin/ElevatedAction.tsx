/**
 * ElevatedAction — visible borrowed authority.
 * -----------------------------------------------------------------------------
 * Wrap any control that a staff member can only use because a break-glass
 * elevation window is open. While the window is live the control gets a warning
 * outline and a small key marker, so nobody has to guess which powers are
 * temporary. When the window closes the wrapper disappears and the control
 * renders exactly as it did before.
 *
 * This is presentation only — the real authority check always happens in the
 * database (`has_active_elevation`), never here.
 */
import type { ReactNode } from "react";
import { KeyRound } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMyElevation } from "@/hooks/useAdminElevation";
import { cn } from "@/lib/utils";

interface ElevatedActionProps {
  children: ReactNode;
  /** What this control does, e.g. "Cancel a paid booking". Shown in the tooltip. */
  label?: string;
  className?: string;
}

export function ElevatedAction({ children, label, className }: ElevatedActionProps) {
  const { isActive, countdown } = useMyElevation();

  if (!isActive) return <>{children}</>;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "relative inline-flex rounded-md ring-2 ring-warning ring-offset-1 ring-offset-background",
              className,
            )}
          >
            {children}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-warning text-warning-foreground shadow"
            >
              <KeyRound className="h-2.5 w-2.5" />
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">
            Borrowed admin authority{label ? ` — ${label}` : ""}. Ends in {countdown}.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * ElevatedOnly — render children only while an elevation window is live.
 * Useful for admin-only controls that should appear for the borrowed window
 * and vanish the moment it lapses.
 */
export function ElevatedOnly({ children, label }: { children: ReactNode; label?: string }) {
  const { isActive } = useMyElevation();
  if (!isActive) return null;
  return <ElevatedAction label={label}>{children}</ElevatedAction>;
}

export default ElevatedAction;
