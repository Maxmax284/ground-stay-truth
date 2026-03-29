/**
 * SecurityFreezeBanner — displays a prominent warning when
 * Fenrir Lock has activated an emergency freeze.
 */
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useSecurityFreeze } from "@/lib/fenrir";
import { useAuth } from "@/hooks/useAuth";

export function SecurityFreezeBanner() {
  const { frozen, threatLevel } = useSecurityFreeze();
  const { role } = useAuth();

  // Only show to staff
  if (!role || role === "guest") return null;
  if (!frozen && threatLevel === "normal") return null;

  if (frozen) {
    return (
      <div className="bg-destructive text-destructive-foreground px-4 py-3 flex items-center gap-3 text-sm font-medium animate-pulse">
        <ShieldAlert className="h-5 w-5 shrink-0" />
        <span>
          🚨 <strong>EMERGENCY SECURITY FREEZE</strong> — All non-essential operations are locked.
          New bookings and admin actions are restricted. Contact the security team immediately.
        </span>
      </div>
    );
  }

  // Elevated threat level banner
  const levelColors: Record<string, string> = {
    elevated: "bg-yellow-500/20 text-yellow-800 dark:text-yellow-200",
    high: "bg-orange-500/20 text-orange-800 dark:text-orange-200",
    critical: "bg-destructive/20 text-destructive",
  };

  const colorClass = levelColors[threatLevel] || "";
  if (!colorClass) return null;

  return (
    <div className={`${colorClass} px-4 py-2 flex items-center gap-3 text-sm font-medium`}>
      <ShieldCheck className="h-4 w-4 shrink-0" />
      <span>
        Security threat level: <strong className="uppercase">{threatLevel}</strong> — Enhanced monitoring active.
      </span>
    </div>
  );
}
