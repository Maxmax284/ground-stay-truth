/**
 * SpotlightLayer — applies the temporary highlight for the active spotlight.
 *
 * Finds rows/cards already rendered on the page via
 * [data-spotlight-kind][data-spotlight-id], glows them, scrolls the first match
 * into view, and clears itself. Respects prefers-reduced-motion by falling back
 * to a static outline instead of a pulse. No new UI, no panels.
 */
import { useEffect } from "react";
import { useSpotlight } from "@/lib/spotlightStore";

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function spotlightSelector(kind: string, id: string): string {
  return `[data-spotlight-kind="${kind}"][data-spotlight-id="${CSS.escape(id)}"]`;
}

export function SpotlightLayer() {
  const spotlight = useSpotlight();

  useEffect(() => {
    if (!spotlight) return;
    const cls = prefersReducedMotion() ? "kg-spotlight-static" : "kg-spotlight";
    const touched: HTMLElement[] = [];

    const apply = () => {
      spotlight.ids.forEach((id, index) => {
        const el = document.querySelector<HTMLElement>(spotlightSelector(spotlight.kind, id));
        if (!el || touched.includes(el)) return;
        el.classList.add(cls);
        if (index === 0) {
          el.setAttribute("data-spotlight-focused", "true");
          el.scrollIntoView({
            behavior: prefersReducedMotion() ? "auto" : "smooth",
            block: "center",
          });
        }
        touched.push(el);
      });
    };

    // Rows may still be mounting when the answer lands.
    apply();
    const retry = window.setTimeout(apply, 250);

    return () => {
      window.clearTimeout(retry);
      for (const el of touched) {
        el.classList.remove("kg-spotlight", "kg-spotlight-static");
        el.removeAttribute("data-spotlight-focused");
      }
    };
  }, [spotlight]);

  return null;
}
