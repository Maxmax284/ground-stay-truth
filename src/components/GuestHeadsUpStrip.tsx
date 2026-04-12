import { useState, useEffect } from "react";
import { X, AlertTriangle, Info, Lightbulb, ChevronRight } from "lucide-react";
import { useIntelligence, type IntelligenceEntry } from "@/hooks/useIntelligence";

const DISMISSED_KEY = "gs_headsup_dismissed";
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  money: <span className="text-base">💰</span>,
  transport: <span className="text-base">🚕</span>,
  safety: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  connectivity: <span className="text-base">📶</span>,
  customs: <span className="text-base">🛂</span>,
  health: <span className="text-base">🏥</span>,
  local_life: <Lightbulb className="h-4 w-4 text-primary" />,
};

interface Props {
  locations?: string[];
  onLearnMore?: (entry: IntelligenceEntry) => void;
}

export function GuestHeadsUpStrip({ locations, onLearnMore }: Props) {
  const { data: entries } = useIntelligence({
    type: "heads_up",
    status: "active",
    locations,
  });

  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  // Filter: guest audience, not dismissed, max 2
  const visible = (entries ?? [])
    .filter((e) => e.audience?.includes("guest") && !dismissed.has(e.id))
    .slice(0, 2);

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map((entry) => (
        <div
          key={entry.id}
          className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm animate-fade-in ${
            entry.severity === "urgent"
              ? "border-destructive/30 bg-destructive/5"
              : entry.severity === "attention"
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-border bg-muted/30"
          }`}
        >
          <span className="mt-0.5 shrink-0">{CATEGORY_ICONS[entry.category] ?? <Info className="h-4 w-4 text-muted-foreground" />}</span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground leading-snug">{entry.title}</p>
            <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">{entry.body}</p>
            {onLearnMore && (
              <button
                onClick={() => onLearnMore(entry)}
                className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-0.5"
              >
                Learn more <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
          {entry.image_url && (
            <img
              src={entry.image_url}
              alt={entry.image_caption || entry.title}
              className="h-12 w-12 rounded object-cover shrink-0"
            />
          )}
          <button
            onClick={() => dismiss(entry.id)}
            className="p-1 rounded hover:bg-accent/60 shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
