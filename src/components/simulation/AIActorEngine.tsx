import { useState } from "react";
import { Bot, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSimulation } from "./SimulationContext";
import { useSimulationActors } from "./useSimulationActors";
import { cn } from "@/lib/utils";

const ACTOR_COLORS: Record<string, string> = {
  guest: "bg-primary/10 text-primary",
  supervisor: "bg-warning/10 text-warning-foreground",
  maintenance: "bg-accent text-accent-foreground",
  front_desk: "bg-info/10 text-info-foreground",
};

const ACTOR_LABELS: Record<string, string> = {
  guest: "Guest AI",
  supervisor: "Supervisor AI",
  maintenance: "Maintenance AI",
  front_desk: "Front Desk AI",
};

export function AIActorEngine() {
  const [enabled, setEnabled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { actorLog } = useSimulation();

  useSimulationActors(enabled);

  return (
    <Card className="border-dashed">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Bot className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">AI Actors</CardTitle>
              <Badge variant="outline" className="text-[10px]">
                {enabled ? "Active" : "Off"}
              </Badge>
              {isOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </CollapsibleTrigger>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {enabled ? "Actors responding" : "Enable actors"}
              </span>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0 px-4 pb-3">
            {!enabled && (
              <p className="text-xs text-muted-foreground">
                Turn on AI Actors to have simulated guests, supervisors, and staff respond to your actions in real time.
              </p>
            )}
            {enabled && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Zap className="h-3 w-3 text-primary" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Active actors:</span>
                  {Object.entries(ACTOR_LABELS).map(([key, label]) => (
                    <Badge key={key} className={cn("text-[10px]", ACTOR_COLORS[key])}>
                      {label}
                    </Badge>
                  ))}
                </div>
                {actorLog.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1 border rounded-md p-2 bg-muted/30">
                    {actorLog.slice(0, 10).map((entry) => (
                      <div key={entry.id} className="flex items-start gap-1.5 text-[11px]">
                        <Badge className={cn("text-[9px] shrink-0 mt-0.5", ACTOR_COLORS[entry.actor])}>
                          {ACTOR_LABELS[entry.actor] || entry.actor}
                        </Badge>
                        <span className="text-muted-foreground truncate">{entry.action}</span>
                      </div>
                    ))}
                  </div>
                )}
                {actorLog.length === 0 && (
                  <p className="text-[11px] text-muted-foreground italic">
                    Waiting for your actions… Create a booking, send a message, or transition a state to trigger AI responses.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
