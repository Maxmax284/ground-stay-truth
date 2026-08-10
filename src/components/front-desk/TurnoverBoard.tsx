/**
 * Turnover Board — today's cleaning work, read-only.
 *
 * Sources `housekeeping_tasks` for the property directly (via
 * useFrontDeskData().todaysTasks) so rooms whose guest already checked out
 * still show up. Housekeeping mutations live in their own module.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import type { FrontDeskBooking, TodayTask } from "@/hooks/useFrontDesk";
import { formatCampShort } from "@/lib/timezone";
import { useTranslation } from "react-i18next";

const TONE: Record<string, string> = {
  pending: "bg-warning/20 text-warning-foreground border-warning/40",
  in_progress: "bg-info/20 text-[hsl(var(--info))] border-[hsl(var(--info))]/30",
  completed: "bg-success/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30",
};

interface Props {
  tasks: TodayTask[];
  /** Kept so the arriving guest can be named on rooms flipping today. */
  arriving: FrontDeskBooking[];
  onOpen: (id: string) => void;
}

export function TurnoverBoard({ tasks, arriving, onOpen }: Props) {
  const { t } = useTranslation();
  const STATUS_WORDS: Record<string, string> = {
    pending: t("frontDesk.turnoverBoard.needsCleaning"),
    in_progress: t("frontDesk.turnoverBoard.beingCleaned"),
    completed: t("frontDesk.turnoverBoard.ready"),
  };
  const TYPE_WORDS: Record<string, string> = {
    turnover: t("frontDesk.turnoverBoard.turnoverType"),
    scheduled: t("frontDesk.turnoverBoard.scheduledClean"),
  };
  if (tasks.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">{t("frontDesk.turnoverBoard.title")}</h2>
          <Badge variant="outline" className="text-[10px]">{tasks.length}</Badge>
          <span className="text-[11px] text-muted-foreground ml-1">
            {t("frontDesk.turnoverBoard.subtitle")}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {tasks.map((task) => {
            const nextGuest = task.booking_in_id
              ? arriving.find((b) => b.id === task.booking_in_id)
              : arriving.find((b) => b.unit_id === task.unit_id);
            const openId = task.booking_in_id ?? task.booking_out_id;
            const clickable = !!openId;
            return (
              <div
                key={task.id}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => onOpen(openId!) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") onOpen(openId!);
                      }
                    : undefined
                }
                className={`text-left rounded-md border border-border/50 p-2.5 ${
                  clickable ? "hover:bg-muted/50 transition-colors cursor-pointer" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground truncate">
                    {task.unit_name}
                  </span>
                  <Badge className={`text-[10px] border ${TONE[task.status] ?? ""}`}>
                    {STATUS_WORDS[task.status] ?? task.status.replace("_", " ")}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {TYPE_WORDS[task.task_type ?? "scheduled"] ?? t("frontDesk.turnoverBoard.cleaning")}
                  {task.due_by ? ` · ${t("frontDesk.turnoverBoard.due", { time: formatCampShort(task.due_by) })}` : ""}
                  {nextGuest ? ` · ${t("frontDesk.turnoverBoard.nextGuestToday")}` : ""}
                </div>
                {task.notes && (
                  <div className="text-[11px] text-muted-foreground mt-1 truncate">{task.notes}</div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
