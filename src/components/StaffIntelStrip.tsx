import { useIntelligence, type IntelligenceEntry } from "@/hooks/useIntelligence";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Zap, ChevronDown, ChevronUp, ArrowLeft, Sparkles, MapPin } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";

export type IntelAnimationMode = "ticker" | "crossfade" | "stack";

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

export function getStoredAnimMode(): IntelAnimationMode {
  try {
    const stored = localStorage.getItem("intel-animation-mode");
    if (stored === "ticker" || stored === "crossfade" || stored === "stack") return stored;
  } catch {}
  return "crossfade";
}

export function setStoredAnimMode(mode: IntelAnimationMode) {
  try { localStorage.setItem("intel-animation-mode", mode); } catch {}
}

function buildWeightedIndices(entries: IntelligenceEntry[]): number[] {
  const indices: number[] = [];
  entries.forEach((e, i) => {
    const weight = e.severity === "urgent" ? 3 : e.severity === "attention" ? 2 : 1;
    for (let w = 0; w < weight; w++) indices.push(i);
  });
  return indices;
}

export function StaffIntelStrip() {
  const { role } = useAuth();
  const { data: entries } = useIntelligence({ type: "heads_up", status: "active" });
  const [collapsed, setCollapsed] = useState(false);
  const [detailEntry, setDetailEntry] = useState<IntelligenceEntry | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [animState, setAnimState] = useState<"visible" | "exiting" | "entering">("visible");
  const [paused, setPaused] = useState(false);
  const [animMode, setAnimMode] = useState<IntelAnimationMode>(getStoredAnimMode);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const staffEntries = (entries ?? []).filter((e) => e.audience?.includes("staff"));
  const weightedIndices = buildWeightedIndices(staffEntries);

  const advance = useCallback(() => {
    if (staffEntries.length <= 1) return;
    setAnimState("exiting");
    setTimeout(() => {
      setActiveIndex((prev) => {
        if (weightedIndices.length === 0) return 0;
        let next: number;
        let attempts = 0;
        do {
          next = weightedIndices[Math.floor(Math.random() * weightedIndices.length)];
          attempts++;
        } while (next === prev && attempts < 10 && staffEntries.length > 1);
        return next;
      });
      setAnimState("entering");
      setTimeout(() => setAnimState("visible"), 350);
    }, 350);
  }, [staffEntries.length, weightedIndices]);

  useEffect(() => {
    if (collapsed || paused || staffEntries.length <= 1) return;
    const interval = setInterval(advance, ROTATION_INTERVAL);
    return () => clearInterval(interval);
  }, [collapsed, paused, advance, staffEntries.length]);

  useEffect(() => {
    setActiveIndex(0);
    setAnimState("visible");
  }, [entries?.length]);

  // Listen for mode changes from IntelligenceEditor
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

  // ── Early returns AFTER all hooks ──
  if (!role || role === "guest") return null;
  if (staffEntries.length === 0) return null;

  const askKruGlitch = (entry: IntelligenceEntry) => {
    window.dispatchEvent(
      new CustomEvent("ask-kru-glitch", {
        detail: { question: `Tell me about: ${entry.title} — Here's the briefing: "${entry.body.slice(0, 300)}"` },
      })
    );
  };

  const safeIndex = activeIndex < staffEntries.length ? activeIndex : 0;

  const getTickerClasses = () => {
    if (animState === "exiting") return "translate-x-[-100%] opacity-0 transition-all duration-300 ease-in";
    if (animState === "entering") return "translate-x-0 opacity-100 transition-all duration-300 ease-out";
    return "translate-x-0 opacity-100";
  };

  const getCrossfadeClasses = () => {
    if (animState === "exiting") return "opacity-0 transition-opacity duration-300 ease-in";
    if (animState === "entering") return "opacity-100 transition-opacity duration-300 ease-out";
    return "opacity-100";
  };

  const getStackClasses = (position: number) => {
    if (position === 0) {
      if (animState === "exiting") return "scale-95 opacity-0 transition-all duration-300 ease-in";
      if (animState === "entering") return "scale-100 opacity-100 transition-all duration-300 ease-out";
      return "scale-100 opacity-100";
    }
    return "scale-[0.97] opacity-70";
  };

  const getAnimClasses = (position = 0) => {
    if (animMode === "ticker") return getTickerClasses();
    if (animMode === "stack") return getStackClasses(position);
    return getCrossfadeClasses();
  };

  const stackEntries = animMode === "stack"
    ? [0, 1, 2].map((offset) => staffEntries[(safeIndex + offset) % staffEntries.length]).filter(Boolean)
    : [];

  const renderEntry = (entry: IntelligenceEntry, className = "") => (
    <button
      key={`${entry.id}-${className}`}
      onClick={() => { setDetailEntry(entry); handlePause(); }}
      onMouseEnter={handlePause}
      onTouchStart={handlePause}
      className={`flex items-start gap-2 py-1.5 pl-2 rounded-sm w-full text-left hover:bg-accent/30 transition-colors ${SEVERITY_STYLES[entry.severity] || ""} ${className}`}
    >
      <div className="flex-1 text-sm text-muted-foreground min-w-0">
        <span className="font-medium text-foreground">{entry.title}</span>
        <span className="ml-1.5 text-xs">{entry.body.slice(0, 80)}{entry.body.length > 80 ? "…" : ""}</span>
      </div>
      <div className="flex gap-1 shrink-0">
        {entry.location?.filter((l) => l !== "global").slice(0, 2).map((loc) => (
          <Badge key={loc} variant="outline" className="text-[10px] px-1 py-0">
            {LOCATION_LABELS[loc] ?? loc}
          </Badge>
        ))}
      </div>
    </button>
  );

  const totalDots = Math.min(staffEntries.length, 8);

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
                      i === safeIndex % totalDots
                        ? "w-3 bg-primary"
                        : "w-1 bg-muted-foreground/30"
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
            {animMode === "stack" ? (
              <div className="space-y-0.5">
                {stackEntries.map((entry, i) => renderEntry(entry, getAnimClasses(i)))}
              </div>
            ) : (
              <div className="overflow-hidden">
                {staffEntries[safeIndex] && renderEntry(staffEntries[safeIndex], getAnimClasses())}
              </div>
            )}
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
                  <button
                    onClick={() => setDetailEntry(null)}
                    className="p-1 -ml-1 rounded-md hover:bg-accent/60 text-muted-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <Badge
                    variant={detailEntry.severity === "urgent" ? "destructive" : "outline"}
                    className="text-[10px]"
                  >
                    {detailEntry.severity === "urgent" ? "🔴 Urgent" : detailEntry.severity === "attention" ? "⚠️ Attention" : "Intel"}
                  </Badge>
                </div>
                <SheetTitle className="text-left text-lg leading-snug pr-6">
                  {detailEntry.title}
                </SheetTitle>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {detailEntry.image_url && (
                  <div className="space-y-1">
                    <img
                      src={detailEntry.image_url}
                      alt={detailEntry.image_caption || detailEntry.title}
                      className="w-full max-h-56 object-cover rounded-lg"
                    />
                    {detailEntry.image_caption && (
                      <p className="text-xs text-muted-foreground italic">{detailEntry.image_caption}</p>
                    )}
                  </div>
                )}

                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {detailEntry.body}
                </p>

                {detailEntry.location && detailEntry.location.filter((l) => l !== "global").length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {detailEntry.location.filter((l) => l !== "global").map((loc) => (
                      <Badge key={loc} variant="outline" className="text-[10px] px-1.5 py-0">
                        {LOCATION_LABELS[loc] ?? loc}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t px-5 py-3 bg-background">
                <Button
                  variant="default"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => {
                    askKruGlitch(detailEntry);
                    setDetailEntry(null);
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                  Ask Kru Glitch about this
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
