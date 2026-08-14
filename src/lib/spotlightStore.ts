/**
 * Spotlight store — lightweight, temporary "point at this record" state.
 *
 * Kru Glitch (or an operational shortcut chip) sets a spotlight; SpotlightLayer
 * finds the matching rows already rendered on the page, glows them briefly and
 * scrolls the first one into view. Auto-expires. Nothing here mutates data.
 */

import { useSyncExternalStore } from "react";

export type SpotlightKind =
  | "booking"
  | "payment"
  | "task"
  | "unit"
  | "pickup"
  | "document"
  | "maintenance";

export interface Spotlight {
  kind: SpotlightKind;
  ids: string[];
  /** Short human reason, e.g. "Check-ins today". */
  reason?: string;
  source: "kru_glitch" | "shortcut";
  at: number;
  durationMs: number;
}

export const DEFAULT_SPOTLIGHT_MS = 4000;

let current: Spotlight | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setSpotlight(
  input: Omit<Spotlight, "at" | "durationMs"> & { durationMs?: number },
): Spotlight | null {
  const ids = Array.from(new Set((input.ids ?? []).filter(Boolean)));
  if (ids.length === 0) {
    clearSpotlight();
    return null;
  }
  if (expiryTimer) clearTimeout(expiryTimer);
  current = {
    kind: input.kind,
    ids,
    reason: input.reason,
    source: input.source,
    at: Date.now(),
    durationMs: input.durationMs ?? DEFAULT_SPOTLIGHT_MS,
  };
  emit();
  expiryTimer = setTimeout(() => {
    // Only expire the spotlight we scheduled.
    clearSpotlight();
  }, current.durationMs);
  return current;
}

export function clearSpotlight() {
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
  if (!current) return;
  current = null;
  emit();
}

export function getSpotlight(): Spotlight | null {
  return current;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSpotlight(): Spotlight | null {
  return useSyncExternalStore(subscribe, getSpotlight, getSpotlight);
}

/** Test helper — resets module state without waiting on timers. */
export function __resetSpotlightForTests() {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  current = null;
  emit();
}
