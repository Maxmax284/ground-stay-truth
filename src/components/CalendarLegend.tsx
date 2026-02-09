import { Badge } from "@/components/ui/badge";
import { STATE_LABELS, type BookingState } from "@/lib/bookingStateMachine";
import { CALENDAR_STATE_COLORS } from "@/components/CalendarGrid";

export function CalendarLegend() {
  const legendItems: { state: BookingState; label: string }[] = [
    { state: "inquiry", label: STATE_LABELS.inquiry },
    { state: "soft_hold", label: STATE_LABELS.soft_hold },
    { state: "pending_approval", label: STATE_LABELS.pending_approval },
    { state: "pending_deposit", label: STATE_LABELS.pending_deposit },
    { state: "confirmed", label: STATE_LABELS.confirmed },
    { state: "checked_in", label: STATE_LABELS.checked_in },
    { state: "completed", label: STATE_LABELS.completed },
    { state: "cancelled", label: STATE_LABELS.cancelled },
    { state: "no_show", label: STATE_LABELS.no_show },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {legendItems.map(({ state, label }) => (
        <div key={state} className="flex items-center gap-1.5">
          <div className={`h-3 w-6 rounded-sm ${CALENDAR_STATE_COLORS[state]}`} />
          <span className="text-muted-foreground">{label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <div className="h-3 w-6 rounded-sm bg-muted" style={{
          backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 2px, hsl(var(--muted-foreground) / 0.15) 2px, hsl(var(--muted-foreground) / 0.15) 4px)"
        }} />
        <span className="text-muted-foreground">Cleaning Buffer</span>
      </div>
    </div>
  );
}
