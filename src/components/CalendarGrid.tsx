import { useMemo } from "react";
import { format, addDays, differenceInDays, isSameDay, isWithinInterval, startOfDay } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { BookingState } from "@/lib/bookingStateMachine";
import { STATE_LABELS } from "@/lib/bookingStateMachine";
import type { Unit } from "@/hooks/useUnits";
import type { BookingWithJoins } from "@/hooks/useBookings";

export const CALENDAR_STATE_COLORS: Record<BookingState, string> = {
  inquiry: "bg-muted",
  soft_hold: "bg-warning/60",
  pending_approval: "bg-warning/80",
  pending_deposit: "bg-warning",
  confirmed: "bg-success",
  checked_in: "bg-info",
  completed: "bg-secondary",
  cancelled: "bg-destructive/30",
  no_show: "bg-destructive/50",
};

interface CalendarGridProps {
  units: Unit[];
  bookings: BookingWithJoins[];
  startDate: Date;
  days: number;
  cleaningBufferHours: number;
  onCellClick?: (unitId: string, date: string) => void;
  onBookingClick?: (bookingId: string) => void;
}

export function CalendarGrid({
  units,
  bookings,
  startDate,
  days,
  cleaningBufferHours,
  onCellClick,
  onBookingClick,
}: CalendarGridProps) {
  const dates = useMemo(() =>
    Array.from({ length: days }, (_, i) => addDays(startDate, i)),
    [startDate, days]
  );

  const cleaningBufferDays = Math.ceil(cleaningBufferHours / 24);

  // Group bookings by unit
  const bookingsByUnit = useMemo(() => {
    const map = new Map<string, typeof bookings>();
    for (const b of bookings) {
      const list = map.get(b.unit_id) ?? [];
      list.push(b);
      map.set(b.unit_id, list);
    }
    return map;
  }, [bookings]);

  const colWidth = 44; // px per day column
  const headerHeight = 56;
  const rowHeight = 48;
  const labelWidth = 140;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: labelWidth + colWidth * days }}>
          {/* Header row: dates */}
          <div className="flex border-b sticky top-0 z-10 bg-card">
            <div
              className="shrink-0 border-r bg-card flex items-end px-3 pb-2 text-xs font-medium text-muted-foreground"
              style={{ width: labelWidth, height: headerHeight }}
            >
              Units
            </div>
            {dates.map((d, i) => {
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              const isToday = isSameDay(d, new Date());
              return (
                <div
                  key={i}
                  className={`shrink-0 border-r flex flex-col items-center justify-end pb-1 text-xs
                    ${isWeekend ? "bg-accent/30" : ""}
                    ${isToday ? "bg-primary/10 font-bold" : ""}
                  `}
                  style={{ width: colWidth, height: headerHeight }}
                >
                  <span className="text-muted-foreground">{format(d, "EEE")}</span>
                  <span className={isToday ? "text-primary" : "text-foreground"}>{format(d, "d")}</span>
                  {(i === 0 || d.getDate() === 1) && (
                    <span className="text-[10px] text-muted-foreground">{format(d, "MMM")}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Unit rows */}
          {units.map((unit) => {
            const unitBookings = bookingsByUnit.get(unit.id) ?? [];
            return (
              <div key={unit.id} className="flex border-b last:border-b-0">
                {/* Unit label */}
                <div
                  className="shrink-0 border-r flex items-center px-3 text-sm font-medium truncate"
                  style={{ width: labelWidth, height: rowHeight }}
                  title={unit.name}
                >
                  {unit.name}
                </div>

                {/* Day cells with booking bars */}
                <div className="relative flex" style={{ height: rowHeight }}>
                  {dates.map((d, i) => {
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <div
                        key={i}
                        className={`shrink-0 border-r cursor-pointer hover:bg-primary/5 transition-colors
                          ${isWeekend ? "bg-accent/10" : ""}
                        `}
                        style={{ width: colWidth, height: rowHeight }}
                        onClick={() => onCellClick?.(unit.id, format(d, "yyyy-MM-dd"))}
                      />
                    );
                  })}

                  {/* Booking bars overlaid */}
                  {unitBookings.map((booking) => {
                    const checkIn = startOfDay(new Date(booking.check_in));
                    const checkOut = startOfDay(new Date(booking.check_out));
                    const gridStart = startOfDay(startDate);
                    const gridEnd = addDays(gridStart, days);

                    // Skip if booking is entirely outside the grid
                    if (checkOut <= gridStart || checkIn >= gridEnd) return null;

                    const barStartOffset = Math.max(0, differenceInDays(checkIn, gridStart));
                    const barEndOffset = Math.min(days, differenceInDays(checkOut, gridStart));
                    const barWidth = barEndOffset - barStartOffset;

                    if (barWidth <= 0) return null;

                    const color = CALENDAR_STATE_COLORS[booking.state as BookingState] ?? "bg-muted";

                    return (
                      <Tooltip key={booking.id}>
                        <TooltipTrigger asChild>
                          <div
                            className={`absolute top-2 rounded-md ${color} cursor-pointer hover:opacity-80 transition-opacity flex items-center px-1.5 overflow-hidden`}
                            style={{
                              left: barStartOffset * colWidth + 2,
                              width: barWidth * colWidth - 4,
                              height: rowHeight - 16,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onBookingClick?.(booking.id);
                            }}
                          >
                            <span className="text-[11px] font-medium text-foreground truncate">
                              {barWidth > 2
                                ? `${format(checkIn, "d")}–${format(checkOut, "d")}`
                                : ""}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-medium">{unit.name}</p>
                          {booking.profiles?.full_name && (
                            <p className="text-xs font-medium">{booking.profiles.full_name}</p>
                          )}
                          <p className="text-xs">
                            {format(checkIn, "MMM d")} → {format(checkOut, "MMM d, yyyy")}
                          </p>
                          <p className="text-xs">{STATE_LABELS[booking.state as BookingState]} · {booking.num_guests} guest{booking.num_guests !== 1 ? "s" : ""}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}

                  {/* Cleaning buffer bars */}
                  {unitBookings
                    .filter((b) => ["completed", "checked_in"].includes(b.state))
                    .map((booking) => {
                      const checkOut = startOfDay(new Date(booking.check_out));
                      const gridStart = startOfDay(startDate);
                      const gridEnd = addDays(gridStart, days);
                      const bufferStart = checkOut;
                      const bufferEnd = addDays(checkOut, cleaningBufferDays);

                      if (bufferStart >= gridEnd || bufferEnd <= gridStart) return null;

                      const barStartOffset = Math.max(0, differenceInDays(bufferStart, gridStart));
                      const barEndOffset = Math.min(days, differenceInDays(bufferEnd, gridStart));
                      const barWidth = barEndOffset - barStartOffset;

                      if (barWidth <= 0) return null;

                      return (
                        <Tooltip key={`buffer-${booking.id}`}>
                          <TooltipTrigger asChild>
                            <div
                              className="absolute top-2 rounded-sm opacity-50"
                              style={{
                                left: barStartOffset * colWidth + 2,
                                width: barWidth * colWidth - 4,
                                height: rowHeight - 16,
                                backgroundImage: "repeating-linear-gradient(45deg, hsl(var(--muted-foreground) / 0.1), hsl(var(--muted-foreground) / 0.1) 3px, hsl(var(--muted) / 0.8) 3px, hsl(var(--muted) / 0.8) 6px)",
                              }}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs">Cleaning buffer ({cleaningBufferHours}h)</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                </div>
              </div>
            );
          })}

          {units.length === 0 && (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              No active units found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
