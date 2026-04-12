import { useIntelligence, type IntelligenceEntry } from "@/hooks/useIntelligence";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Zap, ChevronDown, ChevronUp } from "lucide-react";
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

  if (!role || role === "guest") return null;

  const staffEntries = (entries ?? []).filter((e) => e.audience?.includes("staff"));
  if (staffEntries.length === 0) return null;

  return (
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
            <div
              key={entry.id}
              className={`flex items-start gap-2 py-1 pl-2 rounded-sm ${SEVERITY_STYLES[entry.severity] || ""}`}
            >
              <button
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("ask-kru-glitch", {
                      detail: { question: `Tell me about: ${entry.title} — ${entry.body}` },
                    })
                  );
                }}
                className="flex-1 text-left text-sm text-muted-foreground hover:text-foreground transition-colors min-w-0"
              >
                <span className="font-medium text-foreground">{entry.title}</span>
                <span className="ml-1.5 text-xs">{entry.body.slice(0, 80)}{entry.body.length > 80 ? "…" : ""}</span>
              </button>
              <div className="flex gap-1 shrink-0">
                {entry.location?.filter((l) => l !== "global").slice(0, 2).map((loc) => (
                  <Badge key={loc} variant="outline" className="text-[10px] px-1 py-0">
                    {LOCATION_LABELS[loc] ?? loc}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
