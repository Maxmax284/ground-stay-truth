import { useEffect, useState, type ReactNode } from "react";
import type { FrontDeskBooking } from "@/hooks/useFrontDesk";

/**
 * Front Desk ink stamps — labels derived from data already on the
 * row. The labels change nothing; StampActions holds the staff taps.
 */
export type DeskStampKey = "passport" | "immigration" | "balance" | "room";

export const STAMP_LABEL: Record<DeskStampKey, string> = {
  passport: "Passport inked",
  immigration: "Missing immigration",
  balance: "Balance owed",
  room: "Room dusted & set",
};

const STAMP_TONE: Record<DeskStampKey, string> = {
  passport: "text-[hsl(var(--success))]",
  immigration: "camp-tone-action",
  balance: "camp-tone-locked",
  room: "camp-tone-travel",
};

export function stampsFor(b: FrontDeskBooking): DeskStampKey[] {
  const out: DeskStampKey[] = [];
  const inHouse = b.state === "checked_in" || !!b.arrived_at;
  if (b.docCount > 0) out.push("passport");
  if (inHouse && !b.tm30Filed) out.push("immigration");
  if (b.outstanding > 0) out.push("balance");
  if (b.turnover?.status === "completed") out.push("room");
  return out;
}

export function DeskStamp({ kind, index = 0 }: { kind: DeskStampKey; index?: number }) {
  return (
    <span
      className={`ink-stamp ink-stamp-press ${STAMP_TONE[kind]}`}
      style={{ transform: `rotate(${index % 2 ? 1.8 : -2.5}deg)` }}
    >
      {STAMP_LABEL[kind]}
    </span>
  );
}

/**
 * Brief "board sync" shutter shown when a Front Desk tab opens, then the
 * panel flips in on the same 380ms curve. Reduced-motion: renders instantly.
 */
export function DeskPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [ready, setReady] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const id = window.setTimeout(() => setReady(true), 380);
    return () => window.clearTimeout(id);
  }, [reduce]);

  if (!ready) {
    return (
      <div className="desk-sync" role="status" aria-live="polite">
        <span className="desk-sync-bar" />
        <span className="desk-sync-label">Board sync</span>
      </div>
    );
  }
  return <div className={`desk-panel-in ${className}`}>{children}</div>;
}
