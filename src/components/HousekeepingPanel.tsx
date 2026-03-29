import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useHousekeepingTasks, useUpdateHousekeepingTask } from "@/hooks/useHousekeepingTasks";
import { Sparkles, ArrowRight, User, Clock } from "lucide-react";
import { format } from "date-fns";

const STATUS_FLOW = ["pending", "in_progress", "completed", "skipped"];
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/15 text-warning-foreground",
  in_progress: "bg-primary/15 text-primary",
  completed: "bg-success/15 text-success",
  skipped: "bg-muted text-muted-foreground",
};

export function HousekeepingPanel() {
  const { t } = useTranslation();
  const { data: tasks, isLoading } = useHousekeepingTasks();
  const updateTask = useUpdateHousekeepingTask();
  const { toast } = useToast();

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await updateTask.mutateAsync({ id, status: newStatus });
      toast({ title: "Housekeeping updated", description: `Task moved to ${newStatus.replace(/_/g, " ")}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <Card><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>;

  const activeTasks = (tasks ?? []).filter((t) => t.status !== "completed" && t.status !== "skipped");
  const completedTasks = (tasks ?? []).filter((t) => t.status === "completed" || t.status === "skipped");

  return (
    <Card id="housekeeping-panel">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> Housekeeping
          {activeTasks.length > 0 && (
            <Badge variant="destructive" className="text-xs">{activeTasks.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeTasks.length === 0 && completedTasks.length === 0 && (
          <p className="text-sm text-muted-foreground">No housekeeping tasks. Tasks auto-generate when guests check out.</p>
        )}
        {activeTasks.map((task) => (
          <HousekeepingTaskCard key={task.id} task={task} onStatusChange={handleStatusChange} isPending={updateTask.isPending} />
        ))}
        {completedTasks.length > 0 && (
          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
              {completedTasks.length} completed task(s)
            </summary>
            <div className="space-y-2 mt-2">
              {completedTasks.slice(0, 5).map((task) => (
                <HousekeepingTaskCard key={task.id} task={task} onStatusChange={handleStatusChange} isPending={updateTask.isPending} />
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function HousekeepingTaskCard({ task, onStatusChange, isPending }: { task: any; onStatusChange: (id: string, status: string) => void; isPending: boolean }) {
  const currentIdx = STATUS_FLOW.indexOf(task.status);
  const nextStatus = currentIdx < STATUS_FLOW.length - 2 ? STATUS_FLOW[currentIdx + 1] : null;
  const unitName = task.units?.name ?? "Unknown Unit";
  const guestOut = (task.booking_out as any)?.profiles?.full_name;
  const guestIn = (task.booking_in as any)?.profiles?.full_name;

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{unitName}</span>
          <Badge className={`text-[10px] ${STATUS_COLORS[task.status] ?? ""}`}>
            {task.status.replace(/_/g, " ")}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
          {guestOut && <div className="flex items-center gap-1"><User className="h-3 w-3" /> Checkout: {guestOut}</div>}
          {guestIn && <div className="flex items-center gap-1"><ArrowRight className="h-3 w-3" /> Next: {guestIn}</div>}
          {task.due_by && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> Due: {format(new Date(task.due_by), "MMM d, h:mm a")}
            </div>
          )}
        </div>
        {task.notes && <p className="text-xs text-muted-foreground mt-1 italic">{task.notes}</p>}
      </div>
      <div className="flex gap-1 shrink-0">
        {nextStatus && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onStatusChange(task.id, nextStatus)} disabled={isPending}>
            → {nextStatus.replace(/_/g, " ")}
          </Button>
        )}
        {task.status === "pending" && (
          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => onStatusChange(task.id, "skipped")} disabled={isPending}>
            Skip
          </Button>
        )}
      </div>
    </div>
  );
}
