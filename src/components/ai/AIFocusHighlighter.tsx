import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Watches for `?ai_focus=<key>` in the URL after navigation from an AI source chip.
 * Finds the matching [data-ai-focus="<key>"] element, scrolls it into view,
 * pulses a highlight ring for a few seconds, then strips the query param
 * so the URL stays clean when the user later shares or bookmarks it.
 */
export function AIFocusHighlighter() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const key = params.get("ai_focus");
    if (!key) return;

    let cancelled = false;
    let removeAt: number | null = null;
    let el: HTMLElement | null = null;

    // Poll briefly — target page may still be mounting/loading data.
    const started = Date.now();
    const HIGHLIGHT_CLASSES = [
      "ring-2",
      "ring-primary",
      "ring-offset-2",
      "ring-offset-background",
      "rounded-md",
      "transition-shadow",
      "duration-500",
      "shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]",
    ];

    const ALIASES: Record<string, string[]> = {
      pickups: ["pickups", "front-desk"],
      documents: ["documents", "front-desk"],
    };
    const candidates = ALIASES[key] ?? [key];

    const tryFind = () => {
      if (cancelled) return;
      for (const c of candidates) {
        el = document.querySelector<HTMLElement>(`[data-ai-focus="${CSS.escape(c)}"]`);
        if (el) break;
      }
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add(...HIGHLIGHT_CLASSES);
        removeAt = window.setTimeout(() => {
          el?.classList.remove(...HIGHLIGHT_CLASSES);
        }, 2800);
      } else if (Date.now() - started < 1500) {
        window.setTimeout(tryFind, 120);
      }
    };
    // small delay to let route render
    const t = window.setTimeout(tryFind, 60);

    // Strip ai_focus param so URL stays clean afterwards. Keep other params (e.g. booking).
    const stripT = window.setTimeout(() => {
      const next = new URLSearchParams(location.search);
      next.delete("ai_focus");
      const qs = next.toString();
      navigate(`${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`, { replace: true });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      window.clearTimeout(stripT);
      if (removeAt) window.clearTimeout(removeAt);
      if (el) el.classList.remove(...HIGHLIGHT_CLASSES);
    };
    // Only react to search changes on the same path.
  }, [location.pathname, location.search, location.hash, navigate]);

  return null;
}
