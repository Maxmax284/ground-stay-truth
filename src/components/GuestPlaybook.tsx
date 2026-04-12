import { useState } from "react";
import { useIntelligence, type IntelligenceEntry, type IntelligenceCategory } from "@/hooks/useIntelligence";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, X, MapPin, ChevronRight } from "lucide-react";

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
}

export function GuestPlaybook({ locations }: Props) {
  const { data: entries, isLoading } = useIntelligence({
    type: "playbook",
    status: "active",
    locations,
  });

  const [selectedCategory, setSelectedCategory] = useState<IntelligenceCategory | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const guestEntries = (entries ?? []).filter((e) => e.audience?.includes("guest"));

  // Build category counts
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

  return (
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

      {/* Entry cards */}
      <div className="space-y-2">
        {filtered.map((entry) => (
          <PlaybookCard
            key={entry.id}
            entry={entry}
            isExpanded={expanded === entry.id}
            onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)}
          />
        ))}
      </div>
    </div>
  );
}

function PlaybookCard({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: IntelligenceEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const catInfo = CATEGORY_LABELS[entry.category as IntelligenceCategory];

  return (
    <Card className="overflow-hidden transition-all">
      <button
        onClick={onToggle}
        className="w-full text-left"
      >
        <CardContent className="flex items-start gap-3 py-3 px-4">
          {entry.image_url ? (
            <img
              src={entry.image_url}
              alt={entry.image_caption || entry.title}
              className="h-12 w-12 rounded object-cover shrink-0"
            />
          ) : (
            <span className="text-lg shrink-0">{catInfo?.emoji ?? "📋"}</span>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground leading-snug">{entry.title}</p>
            {!isExpanded && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{entry.body}</p>
            )}
            <div className="flex items-center gap-1.5 mt-1">
              {entry.location?.filter((l) => l !== "global").map((loc) => (
                <Badge key={loc} variant="outline" className="text-[10px] px-1.5 py-0">
                  {LOCATION_LABELS[loc] ?? loc}
                </Badge>
              ))}
            </div>
          </div>
          <ChevronRight className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
        </CardContent>
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 animate-fade-in">
          {entry.image_url && (
            <img
              src={entry.image_url}
              alt={entry.image_caption || entry.title}
              className="w-full max-h-48 object-cover rounded-md"
            />
          )}
          {entry.image_caption && (
            <p className="text-xs text-muted-foreground italic">{entry.image_caption}</p>
          )}
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{entry.body}</p>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1.5"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(
                new CustomEvent("ask-kru-glitch", {
                  detail: { question: `Tell me more about: ${entry.title}` },
                })
              );
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Ask Kru Glitch about this
          </Button>
        </div>
      )}
    </Card>
  );
}
