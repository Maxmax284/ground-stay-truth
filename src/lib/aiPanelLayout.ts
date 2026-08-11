/**
 * Kru Glitch panel layout preference — UI only.
 *
 * Stores nothing sensitive: just the display mode the user picked (compact /
 * normal / expanded) and, on desktop, where they dragged the panel to. Kept in
 * localStorage so the choice survives reloads and route changes.
 */
import { useCallback, useEffect, useState } from "react";

export type AIPanelMode = "compact" | "normal" | "expanded";

const MODE_KEY = "ai.panelMode";
const LEGACY_EXPANDED_KEY = "ai.expanded";
const POS_KEY = "ai.panelPos";

export const AI_PANEL_MODES: AIPanelMode[] = ["compact", "normal", "expanded"];

export const AI_PANEL_MODE_LABELS: Record<AIPanelMode, string> = {
  compact: "Compact",
  normal: "Normal",
  expanded: "Expanded",
};

function readMode(): AIPanelMode {
  if (typeof window === "undefined") return "normal";
  const stored = window.localStorage.getItem(MODE_KEY);
  if (stored === "compact" || stored === "normal" || stored === "expanded") return stored;
  // Migrate the old boolean expand toggle.
  if (window.localStorage.getItem(LEGACY_EXPANDED_KEY) === "1") return "expanded";
  return "normal";
}

export function useAIPanelMode() {
  const [mode, setModeState] = useState<AIPanelMode>(readMode);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  const setMode = useCallback((next: AIPanelMode) => setModeState(next), []);
  const cycleMode = useCallback(() => {
    setModeState((prev) => {
      const idx = AI_PANEL_MODES.indexOf(prev);
      return AI_PANEL_MODES[(idx + 1) % AI_PANEL_MODES.length];
    });
  }, []);

  return { mode, setMode, cycleMode };
}

export type PanelPos = { x: number; y: number };

export function readStoredPos(): PanelPos | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PanelPos;
    if (typeof parsed?.x !== "number" || typeof parsed?.y !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredPos(pos: PanelPos | null) {
  if (typeof window === "undefined") return;
  if (!pos) window.localStorage.removeItem(POS_KEY);
  else window.localStorage.setItem(POS_KEY, JSON.stringify(pos));
}

/**
 * Keeps a dragged panel reachable: never fully off-screen, never negative.
 * `size` is the panel's rendered box; a slice of the panel always stays visible.
 */
export function clampPos(pos: PanelPos, size: { width: number; height: number }): PanelPos {
  if (typeof window === "undefined") return pos;
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - size.width - margin);
  const maxY = Math.max(margin, window.innerHeight - size.height - margin);
  return {
    x: Math.min(Math.max(margin, pos.x), maxX),
    y: Math.min(Math.max(margin, pos.y), maxY),
  };
}

/** Desktop box for each display mode, clamped to the viewport. */
export function panelBoxClasses(mode: AIPanelMode): string {
  switch (mode) {
    case "compact":
      return "w-[360px] max-w-[calc(100vw-2rem)] h-[min(30rem,calc(100dvh-6rem))]";
    case "expanded":
      return "w-[min(1100px,calc(100vw-3rem))] h-[calc(100dvh-3rem)]";
    case "normal":
    default:
      return "w-[500px] max-w-[calc(100vw-2rem)] h-[min(44rem,calc(100dvh-5rem))]";
  }
}
