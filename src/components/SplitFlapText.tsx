import { useEffect, useRef, useState } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·-/";
const TICK_MS = 45;
const SPIN_TICKS = 5;
const MAX_TICKS = 34;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Solari-style split-flap text: each letter tumbles through glyphs and
 * settles left-to-right. Runs once per text change; static for reduced motion.
 */
export function SplitFlapText({ text, className = "" }: { text: string; className?: string }) {
  const [tick, setTick] = useState(() => (prefersReducedMotion() ? Infinity : 0));
  const timer = useRef<number>();

  useEffect(() => {
    if (prefersReducedMotion()) { setTick(Infinity); return; }
    setTick(0);
    const total = MAX_TICKS + SPIN_TICKS;
    timer.current = window.setInterval(() => {
      setTick((t) => {
        if (t >= total) { window.clearInterval(timer.current); return Infinity; }
        return t + 1;
      });
    }, TICK_MS);
    return () => window.clearInterval(timer.current);
  }, [text]);

  const step = text.length > 1 ? MAX_TICKS / (text.length - 1) : 0;
  let idx = 0;
  const words = text.split(/(\s+)/);

  return (
    <span className={className} aria-label={text} role="text">
      {words.map((word, w) => {
        if (/^\s+$/.test(word)) { idx += word.length; return <span key={w} aria-hidden> </span>; }
        return (
          <span key={w} className="inline-flex flex-wrap" aria-hidden>
            {[...word].map((ch, c) => {
              const i = idx++;
              const settleAt = Math.floor(i * step) + SPIN_TICKS;
              const startAt = Math.floor(i * step);
              const settled = tick >= settleAt;
              const shown = settled
                ? ch
                : tick < startAt
                  ? " "
                  : GLYPHS[(i * 7 + tick * 3) % GLYPHS.length];
              return (
                <span key={c} className="flap-cell" data-settled={settled || undefined}>
                  <span key={shown} className={tick === Infinity ? "" : "flap-char"}>{shown}</span>
                </span>
              );
            })}
          </span>
        );
      })}
    </span>
  );
}
