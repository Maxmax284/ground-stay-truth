import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /**
   * Stable key for this moment. The entrance plays once per browser session per
   * key, so a guest refreshing the page five times isn't re-animated at.
   */
  momentKey: string;
  className?: string;
  children: React.ReactNode;
}

const SEEN_PREFIX = "gs-welcome-moment:";

function alreadySeen(key: string): boolean {
  try {
    return sessionStorage.getItem(SEEN_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

function markSeen(key: string) {
  try {
    sessionStorage.setItem(SEEN_PREFIX + key, "1");
  } catch {
    /* private mode — animating twice is harmless */
  }
}

function reducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The one entrance primitive for the guest portal. Everything welcoming is
 * built on this so motion stays consistent and cheap:
 * - honours prefers-reduced-motion (renders instantly, no transform)
 * - plays once per session per key
 * - opacity/transform only, so it stays on the GPU
 */
export function WelcomeMoment({ momentKey, className, children }: Props) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (reducedMotion() || alreadySeen(momentKey)) return;
    markSeen(momentKey);
    setAnimate(true);
  }, [momentKey]);

  return (
    <div className={cn(animate && "animate-fade-up", className)}>{children}</div>
  );
}
