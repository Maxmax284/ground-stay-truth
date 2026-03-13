import { useTranslation } from "react-i18next";
import { CALENDAR_STATE_COLORS } from "@/components/CalendarGrid";
import { CircleDollarSign, CircleCheck, Circle } from "lucide-react";
import type { BookingState } from "@/lib/bookingStateMachine";

const LEGEND_STATES: BookingState[] = [
  "inquiry", "soft_hold", "pending_approval", "pending_deposit",
  "confirmed", "checked_in", "completed", "cancelled", "no_show",
];

export function CalendarLegend() {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      {/* State colors */}
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
      {/* Payment badges */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="text-muted-foreground font-medium">Payment:</span>
        <div className="flex items-center gap-1.5">
          <Circle className="h-3 w-3 text-muted-foreground/50" />
          <span className="text-muted-foreground">Unpaid</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CircleDollarSign className="h-3 w-3 text-amber-600 dark:text-amber-400" />
          <span className="text-muted-foreground">Deposit Paid</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CircleCheck className="h-3 w-3 text-emerald-700 dark:text-emerald-400" />
          <span className="text-muted-foreground">Fully Paid</span>
        </div>
      </div>
    </div>
  );
}
