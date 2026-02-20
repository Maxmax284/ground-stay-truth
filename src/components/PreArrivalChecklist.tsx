import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, CheckCircle2 } from "lucide-react";
import {
  usePreArrivalChecklist,
  useToggleChecklistItem,
  CHECKLIST_ITEMS,
  getChecklistProgress,
} from "@/hooks/usePreArrivalChecklist";

interface PreArrivalChecklistProps {
  bookingId: string;
  readOnly?: boolean;
}

export function PreArrivalChecklist({ bookingId, readOnly = false }: PreArrivalChecklistProps) {
  const { t } = useTranslation();
  const { data: items, isLoading } = usePreArrivalChecklist(bookingId);
  const toggle = useToggleChecklistItem();
  const progress = getChecklistProgress(items);

  const handleToggle = (key: string, checked: boolean) => {
    if (readOnly) return;
    toggle.mutate({ bookingId, itemKey: key, completed: checked });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          {t("preArrival.title", "Pre-Arrival Checklist")}
          {progress.isComplete && (
            <Badge variant="default" className="ml-auto text-xs bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {t("preArrival.complete", "Complete")}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{progress.completed}/{progress.total} {t("preArrival.completed", "completed")}</span>
            <span>{progress.percentage}%</span>
          </div>
          <Progress value={progress.percentage} className="h-2" />
        </div>

        <div className="space-y-3">
          {CHECKLIST_ITEMS.map((ci) => {
            const item = items?.find((i) => i.item_key === ci.key);
            const checked = item?.completed ?? false;
            return (
              <label
                key={ci.key}
                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  checked
                    ? "bg-[hsl(var(--success)/0.05)] border-[hsl(var(--success)/0.3)]"
                    : "hover:bg-accent/40"
                } ${readOnly ? "cursor-default" : ""}`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => handleToggle(ci.key, !!v)}
                  disabled={readOnly || toggle.isPending}
                />
                <span className={`text-sm ${checked ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {t(`preArrival.items.${ci.key}`, ci.label)}
                </span>
              </label>
            );
          })}
        </div>

        {!progress.isComplete && !readOnly && (
          <p className="text-xs text-muted-foreground">
            {t("preArrival.hint", "Complete all items before check-in for a smooth arrival.")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Small badge for staff dashboard showing pre-arrival status */
export function PreArrivalBadge({ bookingId }: { bookingId: string }) {
  const { data: items } = usePreArrivalChecklist(bookingId);
  const progress = getChecklistProgress(items);

  if (progress.isComplete) return null;

  return (
    <Badge variant="outline" className="text-[10px] border-warning/50 text-warning-foreground">
      <ClipboardCheck className="h-3 w-3 mr-0.5" />
      {progress.percentage}%
    </Badge>
  );
}
