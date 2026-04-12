import { useIntelligence, type IntelligenceEntry } from "@/hooks/useIntelligence";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Zap, ChevronDown, ChevronUp, ArrowLeft, Sparkles, MapPin } from "lucide-react";
import { useState } from "react";

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

export function StaffIntelStrip() {
  const { role } = useAuth();
  const { data: entries } = useIntelligence({ type: "heads_up", status: "active" });
  const [collapsed, setCollapsed] = useState(false);
  const [detailEntry, setDetailEntry] = useState<IntelligenceEntry | null>(null);

  if (!role || role === "guest") return null;

  const staffEntries = (entries ?? []).filter((e) => e.audience?.includes("staff"));
  if (staffEntries.length === 0) return null;

  const askKruGlitch = (entry: IntelligenceEntry) => {
    window.dispatchEvent(
      new CustomEvent("ask-kru-glitch", {
        detail: { question: `Tell me about: ${entry.title} — Here's the briefing: "${entry.body.slice(0, 300)}"` },
      })
    );
  };

  return (
    <>
      <Card className="animate-fade-in">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center justify-between w-full px-4 py-2.5 text-left hover:bg-accent/30 rounded-t-[var(--radius)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-sm font-semibold text-foreground">Intel</span>
            <span className="text-xs text-muted-foreground">{staffEntries.length} active</span>
          </div>
          {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
        </button>
        {!collapsed && (
          <CardContent className="px-4 pb-3 pt-0 space-y-1.5">
            {staffEntries.slice(0, 5).map((entry) => (
              <button
                key={entry.id}
                onClick={() => setDetailEntry(entry)}
                className={`flex items-start gap-2 py-1 pl-2 rounded-sm w-full text-left hover:bg-accent/30 transition-colors ${SEVERITY_STYLES[entry.severity] || ""}`}
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
            ))}
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
