import { BookOpen, User, Bot, Trophy, ArrowRight, ArrowLeft, CheckCircle2, Play, MessageSquare, Wrench, Shirt, BarChart3, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useSimulation } from "./SimulationContext";
import { MISSIONS, type Mission } from "./missions";

const ICON_MAP: Record<string, React.ReactNode> = {
  BookOpen: <BookOpen className="h-5 w-5" />,
  User: <User className="h-5 w-5" />,
  Bot: <Bot className="h-5 w-5" />,
  MessageSquare: <MessageSquare className="h-5 w-5" />,
  Wrench: <Wrench className="h-5 w-5" />,
  Shirt: <Shirt className="h-5 w-5" />,
  BarChart3: <BarChart3 className="h-5 w-5" />,
  UserPlus: <UserPlus className="h-5 w-5" />,
};
function MissionCard({ mission, isCompleted, onStart }: { mission: Mission; isCompleted: boolean; onStart: () => void }) {
  const { simulatedRole } = useSimulation();
  const isRecommended = mission.targetRoles.includes(simulatedRole);

  return (
    <Card className={cn(
      "transition-all duration-200 hover-lift",
      isCompleted && "opacity-75",
      isRecommended && !isCompleted && "ring-2 ring-primary/20"
    )}>
      <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            isCompleted ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
          )}>
            {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : ICON_MAP[mission.icon]}
          </div>
          <div>
            <CardTitle className="text-sm">{mission.steps[0]?.title.replace("Step 1: ", "") || mission.id}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{mission.steps.length} steps</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isRecommended && <Badge variant="secondary" className="text-[10px]">Recommended</Badge>}
          {isCompleted && <Badge className="text-[10px] bg-success text-success-foreground">Done</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          {mission.steps[0]?.description.slice(0, 120)}…
        </p>
        <div className="flex flex-wrap gap-1 mb-3">
          {mission.targetRoles.map((r) => (
            <Badge key={r} variant="outline" className="text-[9px] px-1.5">{r.replace("_", " ")}</Badge>
          ))}
        </div>
        <Button
          size="sm"
          variant={isCompleted ? "outline" : "default"}
          className="w-full"
          onClick={onStart}
        >
          <Play className="h-3 w-3 mr-1" />
          {isCompleted ? "Replay" : "Start Mission"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ActiveMission({ mission }: { mission: Mission }) {
  const { missionStep, setMissionStep, completeMission, simulatedRole, setSimulatedRole } = useSimulation();
  const step = mission.steps[missionStep];
  const isLast = missionStep === mission.steps.length - 1;
  const progress = ((missionStep + 1) / mission.steps.length) * 100;

  const handleNext = () => {
    if (isLast) {
      completeMission(mission.id);
    } else {
      const nextStep = mission.steps[missionStep + 1];
      if (nextStep?.requiredRole && nextStep.requiredRole !== simulatedRole) {
        setSimulatedRole(nextStep.requiredRole);
      }
      setMissionStep(missionStep + 1);
    }
  };

  const handleBack = () => {
    if (missionStep > 0) {
      const prevStep = mission.steps[missionStep - 1];
      if (prevStep?.requiredRole && prevStep.requiredRole !== simulatedRole) {
        setSimulatedRole(prevStep.requiredRole);
      }
      setMissionStep(missionStep - 1);
    }
  };

  return (
    <Card className="border-2 border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {ICON_MAP[mission.icon]}
            <CardTitle className="text-base">Mission: {mission.id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            Step {missionStep + 1} / {mission.steps.length}
          </Badge>
        </div>
        <Progress value={progress} className="h-1.5 mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        {step && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">{step.title}</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
            {step.requiredRole && (
              <Badge variant="secondary" className="text-xs">
                Viewing as: {step.requiredRole.replace("_", " ")}
              </Badge>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            disabled={missionStep === 0}
          >
            <ArrowLeft className="h-3 w-3 mr-1" />
            Back
          </Button>
          <Button
            size="sm"
            onClick={handleNext}
            className="flex-1"
          >
            {isLast ? (
              <>
                <Trophy className="h-3 w-3 mr-1" />
                Complete Mission
              </>
            ) : (
              <>
                Next
                <ArrowRight className="h-3 w-3 ml-1" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function MissionRunner() {
  const { activeMission, setActiveMission, setMissionStep, completedMissions, simulatedRole, setSimulatedRole } = useSimulation();

  const active = MISSIONS.find((m) => m.id === activeMission);

  const startMission = (mission: Mission) => {
    setMissionStep(0);
    if (mission.steps[0]?.requiredRole) {
      setSimulatedRole(mission.steps[0].requiredRole);
    }
    setActiveMission(mission.id);
  };

  if (active) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setActiveMission(null); setMissionStep(0); }}
          className="text-muted-foreground"
        >
          <ArrowLeft className="h-3 w-3 mr-1" /> Back to Missions
        </Button>
        <ActiveMission mission={active} />
      </div>
    );
  }

  // Sort: recommended first, then completed last
  const sorted = [...MISSIONS].sort((a, b) => {
    const aRec = a.targetRoles.includes(simulatedRole) ? 1 : 0;
    const bRec = b.targetRoles.includes(simulatedRole) ? 1 : 0;
    const aComp = completedMissions.includes(a.id) ? 1 : 0;
    const bComp = completedMissions.includes(b.id) ? 1 : 0;
    return bRec - aRec || aComp - bComp;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Guided Missions
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completedMissions.length} / {MISSIONS.length} completed
          </p>
        </div>
        {completedMissions.length === MISSIONS.length && (
          <Badge className="bg-success text-success-foreground">
            <Trophy className="h-3 w-3 mr-1" /> All Complete!
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((m) => (
          <MissionCard
            key={m.id}
            mission={m}
            isCompleted={completedMissions.includes(m.id)}
            onStart={() => startMission(m)}
          />
        ))}
      </div>
    </div>
  );
}
