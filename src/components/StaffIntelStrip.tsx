import { useIntelligence, type IntelligenceEntry } from "@/hooks/useIntelligence";
import { useAuth } from "@/hooks/useAuth";
import { useIntelSeen } from "@/hooks/useIntelSeen";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Zap, ChevronDown, ChevronUp, ArrowLeft, Sparkles, MapPin, Eye } from "lucide-react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";

export type IntelAnimationMode = "ticker" | "crossfade" | "stack" | "flip" | "typewriter" | "pulse" | "carousel";

export const INTEL_ANIM_OPTIONS: { mode: IntelAnimationMode; label: string; desc: string }[] = [
  { mode: "ticker", label: "Ticker", desc: "Slides left with trailing scan-line glow" },
  { mode: "crossfade", label: "Crossfade", desc: "Frosted blur transition between entries" },
  { mode: "stack", label: "Stack", desc: "Depth-scaled cards with perspective" },
  { mode: "flip", label: "Flip", desc: "3D flip with shadow flare at midpoint" },
  { mode: "typewriter", label: "Typewriter", desc: "Terminal-style typing with green accent" },
  { mode: "pulse", label: "Pulse", desc: "Scale breathing with ripple ring" },
  { mode: "carousel", label: "Carousel", desc: "Parallax swipe — title leads body" },
];

const LOCATION_LABELS: Record<string, string> = {
  bkk: "BKK", samui: "Samui", nathon: "Nathon", lipa_noi: "Lipa Noi",
  phuket: "Phuket", pattaya: "Pattaya", transit: "Transit",
  bus: "Bus", island: "Island", global: "All",
};

const SEVERITY_STYLES: Record<string, string> = {
  urgent: "border-l-2 border-destructive",
  attention: "border-l-2 border-amber-500",
  normal: "",
};

const ROTATION_INTERVAL = 12000;
const RESUME_DELAY = 5000;
const VISIBLE_COUNT = 3;

export function getStoredAnimMode(): IntelAnimationMode {
  try {
    const stored = localStorage.getItem("intel-animation-mode");
    if (INTEL_ANIM_OPTIONS.some((o) => o.mode === stored)) return stored as IntelAnimationMode;
  } catch {}
  return "crossfade";
}

export function setStoredAnimMode(mode: IntelAnimationMode) {
  try { localStorage.setItem("intel-animation-mode", mode); } catch {}
}

function buildWeightedIndices(entries: IntelligenceEntry[], getSeenWeight: (id: string) => number): number[] {
  const indices: number[] = [];
  entries.forEach((e, i) => {
    const severityWeight = e.severity === "urgent" ? 3 : e.severity === "attention" ? 2 : 1;
    const seenWeight = getSeenWeight(e.id);
    const total = severityWeight * seenWeight;
    for (let w = 0; w < total; w++) indices.push(i);
  });
  return indices;
}

export function StaffIntelStrip() {
  const { role } = useAuth();
  const { data: entries } = useIntelligence({ type: "heads_up", status: "active" });
  const { seen, markSeen, startDisplayTimer, cancelDisplayTimer, resetSeen, getWeight, allSeen } = useIntelSeen("staff");
  const [collapsed, setCollapsed] = useState(false);
  const [detailEntry, setDetailEntry] = useState<IntelligenceEntry | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [animState, setAnimState] = useState<"visible" | "exiting" | "entering">("visible");
  const [paused, setPaused] = useState(false);
  const [animMode, setAnimMode] = useState<IntelAnimationMode>(getStoredAnimMode);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [typedText, setTypedText] = useState("");
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [carouselOffset, setCarouselOffset] = useState(0);
  const touchStartRef = useRef<number | null>(null);

  const staffEntries = useMemo(
    () => (entries ?? []).filter((e) => e.audience?.includes("staff")),
    [entries]
  );
  const weightedIndices = useMemo(() => buildWeightedIndices(staffEntries, getWeight), [staffEntries, getWeight]);

  // Auto-reset seen state when all entries have been read
  useEffect(() => {
    if (staffEntries.length > 0 && allSeen(staffEntries.map((e) => e.id))) {
      resetSeen();
    }
  }, [staffEntries, allSeen, resetSeen]);

  const safeIndex = activeIndex < staffEntries.length ? activeIndex : 0;

  const visibleSlice = useMemo(() => {
    if (staffEntries.length === 0) return [];
    const result: IntelligenceEntry[] = [];
    for (let i = 0; i < Math.min(VISIBLE_COUNT, staffEntries.length); i++) {
      result.push(staffEntries[(safeIndex + i) % staffEntries.length]);
    }
    return result;
  }, [staffEntries, safeIndex]);

  // ── Typewriter effect ──
  const [typewriterLine, setTypewriterLine] = useState(0);
  const [typewriterDone, setTypewriterDone] = useState(false);
  useEffect(() => {
    if (animMode !== "typewriter" || visibleSlice.length === 0 || collapsed) return;
    setTypewriterDone(false);
    const entry = visibleSlice[typewriterLine % visibleSlice.length];
    if (!entry) return;
    const fullText = `${entry.title} — ${entry.body.slice(0, 120)}${entry.body.length > 120 ? "…" : ""}`;
    let charIndex = 0;
    setTypedText("");

    const typeNext = () => {
      if (charIndex <= fullText.length) {
        setTypedText(fullText.slice(0, charIndex));
        charIndex++;
        typeTimerRef.current = setTimeout(typeNext, 30);
      } else {
        const isLastLine = typewriterLine % visibleSlice.length === visibleSlice.length - 1;
        typeTimerRef.current = setTimeout(() => {
          if (isLastLine) {
            setTypewriterDone(true);
          } else {
            setTypewriterLine((prev) => prev + 1);
          }
        }, isLastLine ? 5000 : 3000);
      }
    };
    typeTimerRef.current = setTimeout(typeNext, 200);
    return () => { if (typeTimerRef.current) clearTimeout(typeTimerRef.current); };
  }, [animMode, typewriterLine, visibleSlice, collapsed]);

  useEffect(() => { setTypewriterLine(0); setTypewriterDone(false); }, [activeIndex]);

  const advance = useCallback(() => {
    if (staffEntries.length <= 1) return;
    setAnimState("exiting");
    setTimeout(() => {
      setActiveIndex((prev) => {
        if (weightedIndices.length === 0) return 0;
        let next: number, attempts = 0;
        do {
          next = weightedIndices[Math.floor(Math.random() * weightedIndices.length)];
          attempts++;
        } while (next === prev && attempts < 10 && staffEntries.length > 1);
        return next;
      });
      setAnimState("entering");
      setTimeout(() => setAnimState("visible"), 400);
    }, 400);
  }, [staffEntries.length, weightedIndices]);

  const canAutoAdvance = animMode !== "typewriter" || typewriterDone;
  useEffect(() => {
    if (collapsed || paused || staffEntries.length <= 1 || !canAutoAdvance) return;
    const interval = setInterval(advance, animMode === "typewriter" ? 1000 : ROTATION_INTERVAL);
    return () => clearInterval(interval);
  }, [collapsed, paused, advance, staffEntries.length, canAutoAdvance, animMode]);

  useEffect(() => {
    setActiveIndex(0);
    setAnimState("visible");
  }, [entries?.length]);

  useEffect(() => {
    const handler = () => setAnimMode(getStoredAnimMode());
    window.addEventListener("intel-anim-mode-changed", handler);
    return () => window.removeEventListener("intel-anim-mode-changed", handler);
  }, []);

  const handlePause = useCallback(() => {
    setPaused(true);
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = setTimeout(() => setPaused(false), RESUME_DELAY);
  }, []);

  // Start display timer when visible slice changes
  useEffect(() => {
    if (collapsed) return;
    visibleSlice.forEach((entry) => startDisplayTimer(entry.id));
    return () => visibleSlice.forEach((entry) => cancelDisplayTimer(entry.id));
  }, [visibleSlice, collapsed, startDisplayTimer, cancelDisplayTimer]);

  if (!role || role === "guest") return null;
  if (staffEntries.length === 0) return null;

  const askKruGlitch = (entry: IntelligenceEntry) => {
    window.dispatchEvent(
      new CustomEvent("ask-kru-glitch", {
        detail: { question: `Tell me about: ${entry.title} — Here's the briefing: "${entry.body.slice(0, 300)}"` },
      })
    );
  };

  // ── Enhanced animation classes per mode ──
  const getAnimClasses = (position: number): string => {
    const dur = "duration-[400ms]";
    const delay = position === 0 ? "" : position === 1 ? "delay-[80ms]" : "delay-[160ms]";
    const base = `transition-all ${dur} ${delay}`;

    switch (animMode) {
      case "ticker":
        if (animState === "exiting" && position === 0) return `translate-x-[-100%] opacity-0 ${base} ease-in`;
        if (animState === "entering") return `translate-x-0 opacity-100 ${base} ease-out shadow-[inset_60px_0_30px_-20px_hsl(var(--primary)/0.08)]`;
        return "translate-x-0 opacity-100 shadow-[inset_60px_0_30px_-20px_hsl(var(--primary)/0)]";
      case "crossfade":
        if (animState === "exiting" && position === 0) return `opacity-0 blur-[2px] scale-[0.98] ${base} ease-in`;
        if (animState === "entering") return `opacity-100 blur-0 scale-100 ${base} ease-out`;
        return "opacity-100 blur-0 scale-100";
      case "stack":
        if (position === 0) {
          if (animState === "exiting") return `scale-95 opacity-0 -translate-y-1 ${base}`;
          if (animState === "entering") return `scale-100 opacity-100 translate-y-0 ${base}`;
          return "scale-100 opacity-100 translate-y-0";
        }
        const depthScale = position === 1 ? "scale-[0.96]" : "scale-[0.92]";
        const depthOpacity = position === 1 ? "opacity-60" : "opacity-40";
        return `${depthScale} ${depthOpacity} ${base} origin-top`;
      case "flip":
        if (animState === "exiting" && position === 0)
          return `[transform:rotateY(90deg)] opacity-0 shadow-[0_0_16px_hsl(var(--primary)/0.3)] ${base} [transform-style:preserve-3d]`;
        if (animState === "entering")
          return `[transform:rotateY(0deg)] opacity-100 shadow-none ${base} [transform-style:preserve-3d]`;
        return "[transform:rotateY(0deg)] opacity-100 shadow-none";
      case "pulse":
        if (animState === "exiting" && position === 0) return `scale-110 opacity-0 ${base} ease-in`;
        if (animState === "entering")
          return `scale-100 opacity-100 ${base} ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-[0_0_0_3px_hsl(var(--primary)/0.15),0_0_0_6px_hsl(var(--primary)/0.05)]`;
        return "scale-100 opacity-100 shadow-none";
      default:
        return "opacity-100";
    }
  };

  const renderEntry = (entry: IntelligenceEntry, className = "", isCarousel = false) => {
    const isSeen = seen.has(entry.id);
    return (
      <button
        key={`${entry.id}-${className}`}
        onClick={() => { markSeen(entry.id); setDetailEntry(entry); handlePause(); }}
        onMouseEnter={handlePause}
        onTouchStart={handlePause}
        className={`flex items-start gap-2 py-1 pl-2 rounded-sm w-full text-left hover:bg-accent/30 transition-all ${SEVERITY_STYLES[entry.severity] || ""} ${className} ${isSeen ? "opacity-50" : "opacity-100"}`}
      >
        <div className={`flex-1 text-xs text-muted-foreground min-w-0`}>
          {isCarousel ? (
            <>
              <span className="font-medium text-foreground block transition-transform duration-200">{entry.title}</span>
              <span className="block transition-transform duration-500 delay-[50ms]">{entry.body.slice(0, 70)}{entry.body.length > 70 ? "…" : ""}</span>
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">{entry.title}</span>
              <span className="ml-1.5">{entry.body.slice(0, 70)}{entry.body.length > 70 ? "…" : ""}</span>
            </>
          )}
        </div>
        <div className="flex gap-1 shrink-0 items-center">
          {isSeen && <Eye className="h-3 w-3 text-muted-foreground/40" />}
          {entry.location?.filter((l) => l !== "global").slice(0, 2).map((loc) => (
            <Badge key={loc} variant="outline" className="text-[10px] px-1 py-0">
              {LOCATION_LABELS[loc] ?? loc}
            </Badge>
          ))}
        </div>
      </button>
    );
  };

  const totalDots = Math.min(staffEntries.length, 8);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartRef.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartRef.current;
    if (Math.abs(diff) > 50) {
      handlePause();
      if (diff < 0) advance();
      else setActiveIndex((p) => (p - 1 + staffEntries.length) % staffEntries.length);
    }
    touchStartRef.current = null;
  };

  // ── Render body ──
  const renderBody = () => {
    if (visibleSlice.length === 0) return null;

    if (animMode === "typewriter") {
      return (
        <div className="space-y-0.5 font-mono">
          {visibleSlice.map((entry, i) => {
            const isCurrent = i === typewriterLine % visibleSlice.length;
            const isPast = i < typewriterLine % visibleSlice.length;
            return (
              <button
                key={`${entry.id}-tw${i}`}
                onClick={() => { setDetailEntry(entry); handlePause(); }}
                onMouseEnter={handlePause}
                className={`py-1 pl-2 rounded-sm w-full text-left hover:bg-accent/30 transition-all duration-300 ${SEVERITY_STYLES[entry.severity] || ""} ${
                  isCurrent ? "opacity-100" : isPast ? "opacity-60" : "opacity-30"
                }`}
              >
                <span className="text-xs tracking-wide">
                  {isCurrent ? (
                    <>
                      {/* Terminal green accent for active line */}
                      <span className="text-emerald-600 dark:text-emerald-400 mr-1 text-[10px]">▸</span>
                      <span className="font-medium text-emerald-700 dark:text-emerald-300">{typedText}</span>
                      <span className="inline-block w-[2px] h-3.5 bg-emerald-500 ml-0.5 animate-[pulse_0.8s_ease-in-out_infinite]" />
                    </>
                  ) : isPast ? (
                    <span>
                      <span className="text-muted-foreground/40 mr-1 text-[10px]">▸</span>
                      <span className="font-medium text-foreground/70">{entry.title}</span>{" "}
                      <span className="text-muted-foreground/50">— {entry.body.slice(0, 80)}…</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground/20 text-[10px]">▸ ▌</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      );
    }

    if (animMode === "carousel") {
      return (
        <div
          className="flex gap-2 transition-transform duration-300 ease-out overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{ transform: `translateX(-${carouselOffset}px)` }}
        >
          {visibleSlice.map((entry, i) => (
            <div key={`${entry.id}-c${i}`} className="min-w-[85%] shrink-0">
              {renderEntry(entry, "", true)}
            </div>
          ))}
        </div>
      );
    }

    // All other modes: render visible slice with enhanced staggered animations
    return (
      <div className="space-y-0.5 overflow-hidden [perspective:600px]">
        {visibleSlice.map((entry, i) => renderEntry(entry, getAnimClasses(i)))}
      </div>
    );
  };

  return (
    <>
      <Card className="animate-fade-in overflow-hidden">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center justify-between w-full px-4 py-2.5 text-left hover:bg-accent/30 rounded-t-[var(--radius)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-sm font-semibold text-foreground">Intel</span>
            <span className="text-xs text-muted-foreground">{staffEntries.length} active</span>
            {!collapsed && staffEntries.length > 1 && (
              <div className="flex items-center gap-0.5 ml-1">
                {Array.from({ length: totalDots }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      i === safeIndex % totalDots ? "w-3 bg-primary" : "w-1 bg-muted-foreground/30"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
          {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
        </button>
        {!collapsed && (
          <CardContent className="px-4 pb-3 pt-0 space-y-1">
            {renderBody()}
          </CardContent>
        )}
      </Card>

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
                    {detailEntry.severity === "urgent" ? "🔴 Urgent" : detailEntry.severity === "attention" ? "⚠️ Attention" : "Intel"}
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
                  <Sparkles className="h-4 w-4" /> Ask Kru Glitch about this
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}