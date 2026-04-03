import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ClipboardCheck, CheckCircle2, AlertTriangle, Wifi, Info } from "lucide-react";
import {
  usePreArrivalChecklist,
  useToggleChecklistItem,
  CHECKLIST_SECTIONS,
  getChecklistProgress,
  type ChecklistItemDef,
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

  const getSectionProgress = (sectionItems: readonly ChecklistItemDef[]) => {
    const completed = sectionItems.filter((ci) =>
      items?.some((i) => i.item_key === ci.key && i.completed)
    ).length;
    return { completed, total: sectionItems.length, isComplete: completed === sectionItems.length };
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
        {/* Overall progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{progress.completed}/{progress.total} {t("preArrival.completed", "completed")}</span>
            <span>{progress.percentage}%</span>
          </div>
          <Progress value={progress.percentage} className="h-2" />
        </div>

        {/* Critical items warning */}
        {progress.criticalMissing.length > 0 && !readOnly && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-destructive">
                {progress.criticalMissing.length} critical item{progress.criticalMissing.length > 1 ? "s" : ""} still needed
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                These affect your arrival experience and our ability to guide your pickup.
              </p>
            </div>
          </div>
        )}

        {/* Sectioned checklist */}
        <Accordion type="multiple" defaultValue={CHECKLIST_SECTIONS.map((s) => s.id)} className="space-y-2">
          {CHECKLIST_SECTIONS.map((section) => {
            const sp = getSectionProgress(section.items);
            const isConnectivity = section.id === "connectivity";

            return (
              <AccordionItem key={section.id} value={section.id} className="border rounded-lg px-3">
                <AccordionTrigger className="py-2.5 hover:no-underline">
                  <div className="flex items-center gap-2 text-sm">
                    {isConnectivity && <Wifi className="h-3.5 w-3.5 text-destructive" />}
                    <span className="font-medium">{section.label}</span>
                    <Badge
                      variant={sp.isComplete ? "default" : "secondary"}
                      className={`text-[10px] ${sp.isComplete ? "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]" : ""}`}
                    >
                      {sp.completed}/{sp.total}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <div className="space-y-2">
                    {section.items.map((ci) => {
                      const item = items?.find((i) => i.item_key === ci.key);
                      const checked = item?.completed ?? false;
                      return (
                        <label
                          key={ci.key}
                          className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                            checked
                              ? "bg-[hsl(var(--success)/0.05)] border-[hsl(var(--success)/0.3)]"
                              : ci.critical
                                ? "border-destructive/20 hover:bg-destructive/5"
                                : "hover:bg-accent/40"
                          } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => handleToggle(ci.key, !!v)}
                            disabled={readOnly || toggle.isPending}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-sm ${checked ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                {t(`preArrival.items.${ci.key}`, ci.label)}
                              </span>
                              {ci.critical && !checked && (
                                <Badge variant="outline" className="text-[9px] border-destructive/40 text-destructive shrink-0">
                                  Critical
                                </Badge>
                              )}
                              {ci.type === "info" && (
                                <Info className="h-3 w-3 text-muted-foreground shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                              {ci.why}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

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

  const hasCriticalGaps = progress.criticalMissing.length > 0;

  return (
    <Badge
      variant="outline"
      className={`text-[10px] ${
        hasCriticalGaps
          ? "border-destructive/50 text-destructive"
          : "border-warning/50 text-warning-foreground"
      }`}
    >
      <ClipboardCheck className="h-3 w-3 mr-0.5" />
      {progress.percentage}%
      {hasCriticalGaps && " ⚠"}
    </Badge>
  );
}
