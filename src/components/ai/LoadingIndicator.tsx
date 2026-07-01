import { useEffect, useState } from "react";

const PHASES = [
  "Reading context…",
  "Checking booking details…",
  "Drafting response…",
];

export function LoadingIndicator() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % PHASES.length), 1600);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="mr-4 pl-3 border-l-2 border-primary/20">
      <span className="text-sm text-muted-foreground inline-flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
        <span key={idx} className="animate-fade-up">{PHASES[idx]}</span>
      </span>
    </div>
  );
}
