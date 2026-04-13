import { useState, useCallback, useRef, useEffect } from "react";

const SEEN_KEY_PREFIX = "gs_intel_seen_";
const SEEN_DISPLAY_MS = 3000; // Must be visible for 3s to count as "seen"

interface SeenState {
  /** Set of entry IDs the user has "seen" */
  seen: Set<string>;
  /** Mark an entry as seen (e.g. on click or after display timer) */
  markSeen: (id: string) => void;
  /** Start a display timer — if entry stays visible for 3s, auto-mark seen */
  startDisplayTimer: (id: string) => void;
  /** Cancel display timer (entry left view) */
  cancelDisplayTimer: (id: string) => void;
  /** Reset all seen state (cycle restart) */
  resetSeen: () => void;
  /** Get priority weight multiplier: unseen = 3, seen = 1 */
  getWeight: (id: string) => number;
  /** Check if all provided IDs are seen (triggers auto-reset) */
  allSeen: (ids: string[]) => boolean;
}

export function useIntelSeen(namespace: string): SeenState {
  const storageKey = `${SEEN_KEY_PREFIX}${namespace}`;
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const [seen, setSeen] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...seen]));
    } catch {}
  }, [seen, storageKey]);

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const startDisplayTimer = useCallback((id: string) => {
    if (timers.current.has(id)) return;
    const timer = setTimeout(() => {
      markSeen(id);
      timers.current.delete(id);
    }, SEEN_DISPLAY_MS);
    timers.current.set(id, timer);
  }, [markSeen]);

  const cancelDisplayTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const resetSeen = useCallback(() => {
    setSeen(new Set());
    try { localStorage.removeItem(storageKey); } catch {}
  }, [storageKey]);

  const getWeight = useCallback((id: string) => {
    return seen.has(id) ? 1 : 3;
  }, [seen]);

  const allSeen = useCallback((ids: string[]) => {
    if (ids.length === 0) return false;
    return ids.every((id) => seen.has(id));
  }, [seen]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  return { seen, markSeen, startDisplayTimer, cancelDisplayTimer, resetSeen, getWeight, allSeen };
}
