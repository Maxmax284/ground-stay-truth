import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isSameDay, format, isWithinInterval, parseISO,
} from "date-fns";
import { CALENDAR_STATE_COLORS } from "@/components/CalendarGrid";
import type { BookingState } from "@/lib/bookingStateMachine";
import type { MaintenanceBlock } from "@/hooks/useMaintenanceBlocks";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";

interface Booking {
  id: string;
  unit_id: string;
  check_in: string;
  check_out: string;
  state: string;
  guest_id?: string | null;
  profiles?: { full_name: string | null; email?: string | null } | null;
  manual_guest_name?: string | null;
  manual_guest_email?: string | null;
  manual_guest_phone?: string | null;
  units?: { name: string } | null;
}

interface CalendarMonthViewProps {
  currentMonth: Date;
  bookings: Booking[];
  maintenanceBlocks?: MaintenanceBlock[];
  readOnly?: boolean;
  guestId?: string;
  onDayClick?: (date: Date) => void;
}

export function CalendarMonthView({
  currentMonth,
  bookings,
  maintenanceBlocks = [],
  readOnly = false,
  guestId,
  onDayClick,
}: CalendarMonthViewProps) {
  const { t } = useTranslation();

  const weeks = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const result: Date[][] = [];
    let day = calStart;
    while (day <= calEnd) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(day);
        day = addDays(day, 1);
      }
      result.push(week);
    }
    return result;
  }, [currentMonth]);

  const filteredBookings = useMemo(() => {
    if (guestId) return bookings.filter((b) => b.guest_id === guestId);
    return bookings;
  }, [bookings, guestId]);

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function getBookingsForDay(date: Date) {
    const dateStr = format(date, "yyyy-MM-dd");
    return filteredBookings.filter((b) => dateStr >= b.check_in && dateStr < b.check_out);
  }

  function getMaintenanceForDay(date: Date) {
    const dateStr = format(date, "yyyy-MM-dd");
    return maintenanceBlocks.filter(
      (mb) => dateStr >= mb.start_date && dateStr <= mb.end_date
    );
  }

  const today = new Date();

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b">
        {dayNames.map((d, i) => (
          <div
            key={d}
            className={`text-center text-xs font-medium py-2 text-muted-foreground ${
              i === 0 || i === 6 ? "bg-accent/20" : ""
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
          {week.map((day, di) => {
            const inMonth = isSameMonth(day, currentMonth);
            const isToday = isSameDay(day, today);
            const isWeekend = di === 0 || di === 6;
            const dayBookings = getBookingsForDay(day);
            const dayMaintenance = getMaintenanceForDay(day);

            return (
              <div
                key={di}
                className={`min-h-[80px] sm:min-h-[100px] border-r last:border-r-0 p-1 transition-colors ${
                  !inMonth ? "bg-muted/30" : isWeekend ? "bg-accent/10" : ""
                } ${!readOnly && inMonth ? "cursor-pointer hover:bg-primary/5" : ""}`}
                onClick={() => {
                  if (inMonth && onDayClick) onDayClick(day);
                }}
              >
                {/* Day number */}
                <div className="flex items-center justify-between mb-0.5">
                  <span
                    className={`text-xs font-medium leading-none ${
                      !inMonth
                        ? "text-muted-foreground/40"
                        : isToday
                          ? "bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-[10px]"
                          : "text-foreground"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                {/* Booking indicators */}
                <div className="space-y-0.5">
                  {dayBookings.slice(0, 3).map((b) => {
                    const color =
                      CALENDAR_STATE_COLORS[b.state as BookingState] ?? "bg-muted";
                    return (
                      <div
                        key={b.id}
                        className={`${color} rounded-sm px-1 py-px text-[9px] leading-tight font-medium text-foreground truncate`}
                        title={`${b.units?.name ?? ""} · ${resolveGuestDisplayName(b as any)}`}
                      >
                        <span className="hidden sm:inline">
                          {b.units?.name ?? resolveGuestDisplayName(b as any)}
                        </span>
                        <span className="sm:hidden">&nbsp;</span>
                      </div>
                    );
                  })}
                  {dayBookings.length > 3 && (
                    <div className="text-[9px] text-muted-foreground pl-1">
                      +{dayBookings.length - 3}
                    </div>
                  )}

                  {/* Maintenance indicators */}
                  {dayMaintenance.length > 0 && (
                    <div
                      className="rounded-sm px-1 py-px text-[9px] leading-tight font-medium text-destructive truncate"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(45deg, hsl(var(--destructive) / 0.1), hsl(var(--destructive) / 0.1) 2px, transparent 2px, transparent 4px)",
                      }}
                      title={dayMaintenance[0]?.reason ?? t("calendar.maintenance")}
                    >
                      <span className="hidden sm:inline">{t("calendar.maintenance")}</span>
                      <span className="sm:hidden">&nbsp;</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
