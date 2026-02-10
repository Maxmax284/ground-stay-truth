import { useTranslation } from "react-i18next";
import { CALENDAR_STATE_COLORS } from "@/components/CalendarGrid";
import type { BookingState } from "@/lib/bookingStateMachine";

const LEGEND_STATES: BookingState[] = [
  "inquiry", "soft_hold", "pending_approval", "pending_deposit",
  "confirmed", "checked_in", "completed", "cancelled", "no_show",
];

export function CalendarLegend() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {LEGEND_STATES.map((state) => (
        <div key={state} className="flex items-center gap-1.5">
          <div className={`h-3 w-6 rounded-sm ${CALENDAR_STATE_COLORS[state]}`} />
          <span className="text-muted-foreground">{t(`states.${state}`)}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <div className="h-3 w-6 rounded-sm bg-muted" style={{
          backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 2px, hsl(var(--muted-foreground) / 0.15) 2px, hsl(var(--muted-foreground) / 0.15) 4px)"
        }} />
        <span className="text-muted-foreground">{t("calendar.cleaningBuffer")}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-3 w-6 rounded-sm" style={{
          backgroundImage: "repeating-linear-gradient(45deg, hsl(var(--destructive) / 0.15), hsl(var(--destructive) / 0.15) 2px, hsl(var(--destructive) / 0.05) 2px, hsl(var(--destructive) / 0.05) 4px)",
          border: "1px dashed hsl(var(--destructive) / 0.4)",
        }} />
        <span className="text-muted-foreground">{t("calendar.maintenance")}</span>
      </div>
    </div>
  );
}
