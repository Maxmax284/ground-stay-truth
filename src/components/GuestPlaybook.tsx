import { useState } from "react";
import { useIntelligence, type IntelligenceEntry, type IntelligenceCategory } from "@/hooks/useIntelligence";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Sparkles, MapPin, ChevronRight, ArrowLeft } from "lucide-react";

const CATEGORY_LABELS: Record<IntelligenceCategory, { label: string; emoji: string }> = {
  money: { label: "Money & ATMs", emoji: "💰" },
  transport: { label: "Transport", emoji: "🚕" },
  safety: { label: "Safety", emoji: "🛡️" },
  connectivity: { label: "Connectivity", emoji: "📶" },
  customs: { label: "Customs & Entry", emoji: "🛂" },
  health: { label: "Health", emoji: "🏥" },
  local_life: { label: "Local Life", emoji: "🌴" },
};

const LOCATION_LABELS: Record<string, string> = {
  bkk: "Bangkok",
  samui: "Koh Samui",
  nathon: "Nathon",
  lipa_noi: "Lipa Noi",
  phuket: "Phuket",
  pattaya: "Pattaya",
  transit: "In Transit",
  bus: "Bus",
  island: "Island",
  global: "Everywhere",
};

interface Props {
  locations?: string[];
  initialEntryId?: string;
}

export function GuestPlaybook({ locations, initialEntryId }: Props) {
  const { data: entries, isLoading } = useIntelligence({
    type: "playbook",
    status: "active",
    locations,
  });

  const [selectedCategory, setSelectedCategory] = useState<IntelligenceCategory | null>(null);
  const [detailEntry, setDetailEntry] = useState<IntelligenceEntry | null>(null);

  const guestEntries = (entries ?? []).filter((e) => e.audience?.includes("guest"));

  // Auto-open detail if initialEntryId matches
  if (initialEntryId && !detailEntry) {
    const match = guestEntries.find((e) => e.id === initialEntryId);
    if (match) {
      // Use setTimeout to avoid state update during render
      setTimeout(() => setDetailEntry(match), 0);
    }
  }

  const categoryCounts = guestEntries.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const activeCategories = Object.keys(categoryCounts) as IntelligenceCategory[];
  const filtered = selectedCategory
    ? guestEntries.filter((e) => e.category === selectedCategory)
    : guestEntries;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-muted/30 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (guestEntries.length === 0) {
    return (
      <div className="text-center py-12">
        <MapPin className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground">No local guides available yet</p>
        <p className="text-xs text-muted-foreground mt-1">Check back soon — staff are building this out</p>
      </div>
    );
  }

  const askKruGlitch = (entry: IntelligenceEntry) => {
    window.dispatchEvent(
      new CustomEvent("ask-kru-glitch", {
        detail: {
          question: `Tell me more about: ${entry.title} — Here's what I already read: "${entry.body.slice(0, 300)}"`,
        },
      })
    );
  };

  return (
    <>
      <div className="space-y-4">
        {/* Category filter chips */}
        {activeCategories.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                !selectedCategory ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              All ({guestEntries.length})
            </button>
            {activeCategories.map((cat) => {
              const info = CATEGORY_LABELS[cat];
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    selectedCategory === cat ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {info?.emoji} {info?.label ?? cat} ({categoryCounts[cat]})
                </button>
              );
            })}
          </div>
        )}

        {/* Entry cards — tap opens detail sheet */}
        <div className="space-y-2">
          {filtered.map((entry) => {
            const catInfo = CATEGORY_LABELS[entry.category as IntelligenceCategory];
            return (
              <Card
                key={entry.id}
                className="overflow-hidden cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
                onClick={() => setDetailEntry(entry)}
              >
                <CardContent className="flex items-start gap-3 py-3 px-4">
                  {entry.image_url ? (
                    <img
                      src={entry.image_url}
                      alt={entry.image_caption || entry.title}
                      className="h-12 w-12 rounded object-cover shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-lg shrink-0 mt-0.5">{catInfo?.emoji ?? "📋"}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground leading-snug">{entry.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{entry.body}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {entry.location?.filter((l) => l !== "global").slice(0, 3).map((loc) => (
                        <Badge key={loc} variant="outline" className="text-[10px] px-1.5 py-0">
                          {LOCATION_LABELS[loc] ?? loc}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Detail Sheet ── */}
      <Sheet open={!!detailEntry} onOpenChange={(open) => !open && setDetailEntry(null)}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl px-0 pb-0">
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
                  <Badge variant="outline" className="text-[10px]">
                    {CATEGORY_LABELS[detailEntry.category as IntelligenceCategory]?.emoji}{" "}
                    {CATEGORY_LABELS[detailEntry.category as IntelligenceCategory]?.label}
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

                {/* Location tags */}
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

              {/* Sticky bottom CTA */}
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
