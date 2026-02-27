import { useState, useMemo } from "react";
import { Bot, ChevronDown, ChevronUp, Zap, Brain, Trash2, BarChart3 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { useSimulation, type ActorDifficulty } from "./SimulationContext";
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

const DIFFICULTY_CONFIG: Record<ActorDifficulty, { label: string; color: string; description: string }> = {
  calm: { label: "Calm", color: "bg-success/15 text-success hover:bg-success/25", description: "Polite, patient guests" },
  neutral: { label: "Neutral", color: "bg-muted text-muted-foreground hover:bg-muted/80", description: "Normal operations" },
  demanding: { label: "Demanding", color: "bg-warning/15 text-warning-foreground hover:bg-warning/25", description: "Impatient guests, critical supervisor" },
  chaos: { label: "Chaos", color: "bg-destructive/15 text-destructive hover:bg-destructive/25", description: "High-pressure day + random events" },
};

const LOG_TYPE_ICONS: Record<string, string> = {
  response: "💬",
  escalation: "⚠️",
  chaos: "🌀",
  suppressed: "🔇",
};

function DebriefDialog() {
  const { actorLog, data } = useSimulation();

  const stats = useMemo(() => {
    const byRole: Record<string, number> = {};
    let escalations = 0;
    let chaosEvents = 0;
    let suppressed = 0;

    for (const entry of actorLog) {
      if (entry.type === "response" || !entry.type) {
        byRole[entry.actor] = (byRole[entry.actor] || 0) + 1;
      }
      if (entry.type === "escalation") escalations++;
      if (entry.type === "chaos") chaosEvents++;
      if (entry.type === "suppressed") suppressed++;
    }

    const resolvedMaintenance = data.maintenanceRequests.filter((r) => r.status === "resolved").length;
    const deliveredLaundry = data.laundryRequests.filter((r) => r.status === "delivered").length;
    const totalServiceRequests = data.maintenanceRequests.length + data.laundryRequests.length;
    const resolutionEfficiency = totalServiceRequests > 0
      ? Math.round(((resolvedMaintenance + deliveredLaundry) / totalServiceRequests) * 100)
      : 0;

    return { byRole, escalations, chaosEvents, suppressed, resolutionEfficiency, totalMessages: data.messages.length };
  }, [actorLog, data]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-[10px] h-6 gap-1">
          <BarChart3 className="h-3 w-3" /> Session Debrief
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>War Room Debrief</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-primary">{stats.resolutionEfficiency}%</p>
                <p className="text-[10px] text-muted-foreground">Resolution Efficiency</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold">{stats.totalMessages}</p>
                <p className="text-[10px] text-muted-foreground">Messages Exchanged</p>
              </CardContent>
            </Card>
          </div>

          <div>
            <h4 className="text-xs font-semibold mb-2">Actor Responses</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byRole).map(([actor, count]) => (
                <Badge key={actor} className={cn("text-[10px]", ACTOR_COLORS[actor])}>
                  {ACTOR_LABELS[actor] || actor}: {count}
                </Badge>
              ))}
              {Object.keys(stats.byRole).length === 0 && (
                <span className="text-xs text-muted-foreground">No actor responses yet</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="border rounded-md p-2">
              <p className="text-lg font-bold">⚠️ {stats.escalations}</p>
              <p className="text-[10px] text-muted-foreground">Escalations</p>
            </div>
            <div className="border rounded-md p-2">
              <p className="text-lg font-bold">🌀 {stats.chaosEvents}</p>
              <p className="text-[10px] text-muted-foreground">Chaos Events</p>
            </div>
            <div className="border rounded-md p-2">
              <p className="text-lg font-bold">🔇 {stats.suppressed}</p>
              <p className="text-[10px] text-muted-foreground">Suppressed</p>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold mb-2">Bookings Handled</h4>
            <div className="flex flex-wrap gap-1">
              {data.bookings.map((b) => (
                <Badge key={b.id} variant="outline" className="text-[9px]">
                  {b.guest_name}: {b.state.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <DialogClose asChild>
          <Button variant="outline" className="w-full">Close</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

export function AIActorEngine() {
  const [enabled, setEnabled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { actorLog, actorMemory, clearActorMemory, actorDifficulty, setActorDifficulty } = useSimulation();

  useSimulationActors(enabled);

  const hasMemory = Object.values(actorMemory).some((entries) => entries.length > 0);
  const totalMemoryEntries = Object.values(actorMemory).reduce((sum, entries) => sum + entries.length, 0);

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
              {hasMemory && enabled && (
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary gap-0.5">
                  <Brain className="h-2.5 w-2.5" /> Memory ({totalMemoryEntries})
                </Badge>
              )}
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
              <div className="space-y-3">
                {/* Difficulty selector */}
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1.5 block">Difficulty</span>
                  <div className="flex gap-1">
                    {(Object.entries(DIFFICULTY_CONFIG) as [ActorDifficulty, typeof DIFFICULTY_CONFIG[ActorDifficulty]][]).map(([key, cfg]) => (
                      <Button
                        key={key}
                        size="sm"
                        variant="ghost"
                        className={cn(
                          "text-[10px] h-6 px-2 rounded-full transition-all",
                          actorDifficulty === key ? cfg.color + " font-semibold ring-1 ring-current/20" : "opacity-60"
                        )}
                        onClick={() => setActorDifficulty(key)}
                        title={cfg.description}
                      >
                        {cfg.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Active actors + controls */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Zap className="h-3 w-3 text-primary" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Active:</span>
                    {Object.entries(ACTOR_LABELS).map(([key, label]) => (
                      <Badge key={key} className={cn("text-[10px]", ACTOR_COLORS[key])}>
                        {label}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    {hasMemory && (
                      <Button size="sm" variant="ghost" className="text-[10px] h-6 px-1.5 gap-0.5" onClick={clearActorMemory} title="Clear actor memory">
                        <Trash2 className="h-3 w-3" /> Clear Memory
                      </Button>
                    )}
                    {actorLog.length >= 5 && <DebriefDialog />}
                  </div>
                </div>

                {/* Activity log */}
                {actorLog.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1 border rounded-md p-2 bg-muted/30">
                    {actorLog.slice(0, 15).map((entry) => (
                      <div key={entry.id} className="flex items-start gap-1.5 text-[11px]">
                        <span className="shrink-0 mt-0.5">{LOG_TYPE_ICONS[entry.type || "response"] || "💬"}</span>
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
