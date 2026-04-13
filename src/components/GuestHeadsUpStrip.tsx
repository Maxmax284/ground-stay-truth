import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { X, AlertTriangle, Info, Lightbulb, ChevronRight, ChevronLeft, Eye } from "lucide-react";
import { useIntelligence, type IntelligenceEntry } from "@/hooks/useIntelligence";
import { useIntelSeen } from "@/hooks/useIntelSeen";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowLeft, MapPin } from "lucide-react";

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

/** Category accent colors for card edge */
const CATEGORY_ACCENT: Record<string, string> = {
  money: "border-l-[3px] border-l-amber-500/60",
  transport: "border-l-[3px] border-l-blue-500/60",
  safety: "border-l-[3px] border-l-destructive/50",
  connectivity: "border-l-[3px] border-l-emerald-500/60",
  customs: "border-l-[3px] border-l-purple-500/60",
  health: "border-l-[3px] border-l-rose-500/60",
  local_life: "border-l-[3px] border-l-primary/50",
};

const LOCATION_LABELS: Record<string, string> = {
  bkk: "BKK", samui: "Samui", nathon: "Nathon", lipa_noi: "Lipa Noi",
  phuket: "Phuket", pattaya: "Pattaya", transit: "Transit",
  bus: "Bus", island: "Island", global: "All",
};

const ROTATION_INTERVAL = 10000;

interface Props {
  locations?: string[];
  onLearnMore?: (entry: IntelligenceEntry) => void;
  journeyPhase?: "pre_arrival" | "transit" | "arrival" | "stay" | "departure";
}

const PHASE_LOCATIONS: Record<string, string[]> = {
  pre_arrival: ["global", "bkk"],
  transit: ["bkk", "transit", "bus", "nathon", "lipa_noi"],
  arrival: ["samui", "nathon", "lipa_noi", "island"],
  stay: ["samui", "island", "global"],
  departure: ["samui", "island", "bkk", "global"],
};

const PHASE_CATEGORIES: Record<string, string[]> = {
  pre_arrival: ["customs", "connectivity", "money", "health"],
  transit: ["transport", "safety", "money"],
  arrival: ["transport", "safety", "local_life"],
  stay: ["money", "connectivity", "local_life", "health", "safety"],
  departure: ["transport", "customs", "money"],
};

export function GuestHeadsUpStrip({ locations, onLearnMore, journeyPhase }: Props) {
  const { data: entries } = useIntelligence({
    type: "heads_up",
    status: "active",
    locations,
  });

  const { seen, markSeen, startDisplayTimer, cancelDisplayTimer, resetSeen, getWeight, allSeen } = useIntelSeen("guest");

  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [animState, setAnimState] = useState<"visible" | "exiting-left" | "entering-right" | "exiting-right" | "entering-left">("visible");
  const [paused, setPaused] = useState(false);
  const [detailEntry, setDetailEntry] = useState<IntelligenceEntry | null>(null);
  const [tappedId, setTappedId] = useState<string | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<number | null>(null);

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const visible = useMemo(() => {
    let filtered = (entries ?? []).filter(
      (e) => e.audience?.includes("guest") && !dismissed.has(e.id)
    );

    if (journeyPhase && PHASE_CATEGORIES[journeyPhase]) {
      const phaseCats = PHASE_CATEGORIES[journeyPhase];
      const phaseLocs = PHASE_LOCATIONS[journeyPhase] || [];

      filtered = filtered
        .map((e) => ({
          entry: e,
          score:
            (phaseCats.includes(e.category) ? 2 : 0) +
            (e.location?.some((l) => phaseLocs.includes(l)) ? 1 : 0) +
            (e.severity === "urgent" ? 3 : e.severity === "attention" ? 1 : 0) +
            (seen.has(e.id) ? 0 : 4), // Unseen entries get priority boost
        }))
        .sort((a, b) => b.score - a.score)
        .map((s) => s.entry);
    }

    return filtered;
  }, [entries, dismissed, journeyPhase, seen]);

  // Auto-reset seen state when all visible entries have been read
  useEffect(() => {
    if (visible.length > 0 && allSeen(visible.map((e) => e.id))) {
      resetSeen();
    }
  }, [visible, allSeen, resetSeen]);

  const handlePause = useCallback(() => {
    setPaused(true);
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = setTimeout(() => setPaused(false), 5000);
  }, []);

  const goNext = useCallback(() => {
    if (visible.length <= 1) return;
    setAnimState("exiting-left");
    setTimeout(() => {
      setCurrentIndex((p) => (p + 1) % visible.length);
      setAnimState("entering-right");
      setTimeout(() => setAnimState("visible"), 350);
    }, 350);
  }, [visible.length]);

  const goPrev = useCallback(() => {
    if (visible.length <= 1) return;
    setAnimState("exiting-right");
    setTimeout(() => {
      setCurrentIndex((p) => (p - 1 + visible.length) % visible.length);
      setAnimState("entering-left");
      setTimeout(() => setAnimState("visible"), 350);
    }, 350);
  }, [visible.length]);

  useEffect(() => {
    if (paused || visible.length <= 1) return;
    const interval = setInterval(goNext, ROTATION_INTERVAL);
    return () => clearInterval(interval);
  }, [paused, goNext, visible.length]);

  useEffect(() => {
    setCurrentIndex(0);
    setAnimState("visible");
  }, [entries?.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartRef.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartRef.current;
    if (Math.abs(diff) > 50) {
      handlePause();
      if (diff < 0) goNext();
      else goPrev();
    }
    touchStartRef.current = null;
  };

  // Tap micro-interaction
  const handleCardTap = (entry: IntelligenceEntry) => {
    markSeen(entry.id);
    setTappedId(entry.id);
    setTimeout(() => setTappedId(null), 200);
    setDetailEntry(entry);
  };

  const safeIndex = currentIndex < visible.length ? currentIndex : 0;

  const visibleCards = useMemo(() => {
    if (visible.length === 0) return [];
    const count = Math.min(3, visible.length);
    const cards: IntelligenceEntry[] = [];
    for (let i = 0; i < count; i++) {
      cards.push(visible[(safeIndex + i) % visible.length]);
    }
    return cards;
  }, [visible, safeIndex]);

  // Start display timer for visible cards
  useEffect(() => {
    visibleCards.forEach((entry) => startDisplayTimer(entry.id));
    return () => visibleCards.forEach((entry) => cancelDisplayTimer(entry.id));
  }, [visibleCards, startDisplayTimer, cancelDisplayTimer]);

  if (visible.length === 0) return null;

  const getCardClasses = (position: number): string => {
    if (position === 0) {
      switch (animState) {
        case "exiting-left": return "translate-x-[-110%] scale-95 opacity-0 transition-all duration-300 ease-in";
        case "entering-right": return "translate-x-0 scale-100 opacity-100 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]";
        case "exiting-right": return "translate-x-[110%] scale-95 opacity-0 transition-all duration-300 ease-in";
        case "entering-left": return "translate-x-0 scale-100 opacity-100 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]";
        default: return "translate-x-0 scale-100 opacity-100";
      }
    }
    const delay = position === 1 ? "delay-[100ms]" : "delay-[200ms]";
    if (animState === "entering-right" || animState === "entering-left") {
      return `translate-x-0 scale-100 opacity-100 transition-all duration-300 ${delay} ease-[cubic-bezier(0.34,1.56,0.64,1)]`;
    }
    if (animState === "exiting-left" || animState === "exiting-right") {
      return `scale-95 opacity-0 transition-all duration-200 ${delay}`;
    }
    return "translate-x-0 scale-100 opacity-100";
  };

  const getSeverityBorder = (entry: IntelligenceEntry) =>
    entry.severity === "urgent"
      ? "border-destructive/40 bg-destructive/5"
      : entry.severity === "attention"
      ? "border-amber-500/40 bg-amber-500/5"
      : "border-border bg-muted/20";

  const askKruGlitch = (e: IntelligenceEntry) => {
    window.dispatchEvent(
      new CustomEvent("ask-kru-glitch", {
        detail: { question: `Tell me about: ${e.title} — "${e.body.slice(0, 300)}"` },
      })
    );
  };

  return (
    <>
      <div className="space-y-2">
        {/* Phase label */}
        {journeyPhase && (
          <div className="flex items-center gap-1.5 px-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {journeyPhase === "pre_arrival" ? "Before You Arrive" :
               journeyPhase === "transit" ? "While In Transit" :
               journeyPhase === "arrival" ? "Arriving on Island" :
               journeyPhase === "stay" ? "During Your Stay" :
               "Before You Leave"}
            </span>
            {visible.length > 1 && (
              <div className="flex items-center gap-0.5 ml-auto">
                {visible.slice(0, Math.min(visible.length, 6)).map((_, i) => (
                  <span
                    key={i}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      i === safeIndex ? "w-3 bg-primary" : "w-1 bg-muted-foreground/25"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stacked carousel cards */}
        <div
          className="overflow-hidden relative space-y-2"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseEnter={handlePause}
        >
          {visibleCards.map((entry, i) => {
            const isSeen = seen.has(entry.id);
            return (
            <div
              key={`${entry.id}-${i}`}
              onClick={() => handleCardTap(entry)}
              className={`
                rounded-xl border px-3 py-3 cursor-pointer
                backdrop-blur-sm bg-card/80
                ${getSeverityBorder(entry)}
                ${CATEGORY_ACCENT[entry.category] || ""}
                ${getCardClasses(i)}
                ${tappedId === entry.id ? "scale-[0.97] transition-transform duration-100" : ""}
                ${isSeen ? "opacity-60" : "opacity-100"}
                hover:-translate-y-0.5 hover:shadow-md transition-all duration-200
              `}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0">
                  {CATEGORY_ICONS[entry.category] ?? <Info className="h-4 w-4 text-muted-foreground" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground leading-snug">{entry.title}</p>
                  <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">{entry.body}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDetailEntry(entry); }}
                      className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      Learn more <ChevronRight className="h-3 w-3" />
                    </button>
                    {entry.location?.filter((l) => l !== "global").slice(0, 2).map((loc) => (
                      <Badge key={loc} variant="outline" className="text-[9px] px-1 py-0">
                        {LOCATION_LABELS[loc] ?? loc}
                      </Badge>
                    ))}
                  </div>
                </div>
                {entry.image_url && (
                  <img
                    src={entry.image_url}
                    alt={entry.image_caption || entry.title}
                    className="h-14 w-14 rounded-lg object-cover shrink-0 shadow-sm"
                  />
                )}
                {i === 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); dismiss(entry.id); handlePause(); }}
                    className="p-1 rounded hover:bg-accent/60 shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors absolute top-2 right-2"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            );
          })}

          {/* Swipe hint arrows for desktop */}
          {visible.length > 1 && (
            <>
              <button
                onClick={() => { handlePause(); goPrev(); }}
                className="absolute left-1 top-8 -translate-y-1/2 p-1 rounded-full bg-background/80 shadow-sm hover:bg-accent/60 transition-colors hidden sm:flex"
              >
                <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <button
                onClick={() => { handlePause(); goNext(); }}
                className="absolute right-1 top-8 -translate-y-1/2 p-1 rounded-full bg-background/80 shadow-sm hover:bg-accent/60 transition-colors hidden sm:flex"
              >
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!detailEntry} onOpenChange={(open) => !open && setDetailEntry(null)}>
        <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl px-0 pb-0">
          {detailEntry && (
            <div className="flex flex-col h-full">
              <SheetHeader className="px-5 pb-3 border-b">
                <div className="flex items-center gap-2">
                  <button onClick={() => setDetailEntry(null)} className="p-1 -ml-1 rounded-md hover:bg-accent/60 text-muted-foreground">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <Badge variant={detailEntry.severity === "urgent" ? "destructive" : "outline"} className="text-[10px]">
                    {detailEntry.severity === "urgent" ? "🔴 Urgent" : detailEntry.severity === "attention" ? "⚠️ Attention" : "Good to Know"}
                  </Badge>
                </div>
                <SheetTitle className="text-left text-lg leading-snug pr-6">{detailEntry.title}</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {detailEntry.image_url && (
                  <div className="space-y-1">
                    <img src={detailEntry.image_url} alt={detailEntry.image_caption || detailEntry.title} className="w-full max-h-56 object-cover rounded-lg" />
                    {detailEntry.image_caption && <p className="text-xs text-muted-foreground italic">{detailEntry.image_caption}</p>}
                  </div>
                )}
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{detailEntry.body}</p>
                {detailEntry.location && detailEntry.location.filter((l) => l !== "global").length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {detailEntry.location.filter((l) => l !== "global").map((loc) => (
                      <Badge key={loc} variant="outline" className="text-[10px] px-1.5 py-0">{LOCATION_LABELS[loc] ?? loc}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t px-5 py-3 bg-background">
                <Button variant="default" size="sm" className="w-full gap-2" onClick={() => { askKruGlitch(detailEntry); setDetailEntry(null); }}>
                  <Sparkles className="h-4 w-4" /> Ask about this
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}