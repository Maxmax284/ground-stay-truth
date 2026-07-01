/**
 * Kru Glitch focus context — Phase 2.
 *
 * Lightweight singleton for tracking what the staff user is currently
 * looking at (e.g. a booking sheet). When set, the AI assistant will
 * include a FOCUSED CONTEXT block scoped to that record so answers
 * are grounded to the visible booking rather than the whole property.
 *
 * Purely additive. Nothing here mutates state or executes actions.
 */

import { useSyncExternalStore } from "react";

export interface AIFocus {
  kind: "booking";
  bookingId: string;
  /** Human-readable label shown in the panel chip (e.g. guest name + unit). */
  label?: string;
  /** Optional guest contact — enables draft handoff buttons (WhatsApp, email). */
  guestName?: string;
  guestPhone?: string;
  guestEmail?: string;
}

let current: AIFocus | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setAIFocus(focus: AIFocus | null) {
  // Avoid churn if identical
  if (
    (!current && !focus) ||
    (current && focus && current.kind === focus.kind && current.bookingId === focus.bookingId && current.label === focus.label)
  ) return;
  current = focus;
  emit();
}

export function clearAIFocus(bookingId?: string) {
  // Only clear if we're clearing the one we set (prevents unmount races
  // between two sheets swapping focus).
  if (bookingId && current?.bookingId !== bookingId) return;
  if (!current) return;
  current = null;
  emit();
}

export function getAIFocus(): AIFocus | null {
  return current;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useAIFocus(): AIFocus | null {
  return useSyncExternalStore(subscribe, getAIFocus, getAIFocus);
}
