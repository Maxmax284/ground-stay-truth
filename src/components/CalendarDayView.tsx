import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format, isSameDay, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { STATE_VARIANTS, type BookingState } from "@/lib/bookingStateMachine";
import type { Unit } from "@/hooks/useUnits";
import type { BookingWithJoins } from "@/hooks/useBookings";
import type { MaintenanceBlock } from "@/hooks/useMaintenanceBlocks";
import { Building2, UserCheck, LogIn, LogOut, Wrench, CalendarDays } from "lucide-react";
import { resolveGuestDisplayName } from "@/lib/guestDisplay";

interface CalendarDayViewProps {
  date: Date;
  units: Unit[];
  bookings: BookingWithJoins[];
  maintenanceBlocks: MaintenanceBlock[];
  onBookingClick?: (bookingId: string) => void;
  onAvailableClick?: (unitId: string, date: string) => void;
}

export function CalendarDayView({
  date,
  units,
  bookings,
  maintenanceBlocks,
  onBookingClick,
  onAvailableClick,
}: CalendarDayViewProps) {
  const { t } = useTranslation();
  const dateStr = format(date, "yyyy-MM-dd");

  const unitStatuses = useMemo(() => {
    return units.map((unit) => {
      const unitBookings = bookings.filter(
        (b) => b.unit_id === unit.id && dateStr >= b.check_in && dateStr < b.check_out
      );

      const maintenance = maintenanceBlocks.find(
        (mb) => mb.unit_id === unit.id && dateStr >= mb.start_date && dateStr <= mb.end_date
      );

      const arriving = bookings.filter(
        (b) => b.unit_id === unit.id && b.check_in === dateStr
      );

      const departing = bookings.filter(
        (b) => b.unit_id === unit.id && b.check_out === dateStr
      );

      return {
        unit,
        bookings: unitBookings,
        maintenance,
        isArriving: arriving.length > 0,
        isDeparting: departing.length > 0,
        arriving,
        departing,
      };
    });
  }, [units, bookings, maintenanceBlocks, dateStr]);

  const summary = useMemo(() => {
    const occupied = unitStatuses.filter((s) => s.bookings.length > 0).length;
    const arriving = unitStatuses.filter((s) => s.isArriving).length;
    const departing = unitStatuses.filter((s) => s.isDeparting).length;
    const blocked = unitStatuses.filter((s) => s.maintenance).length;
    return { occupied, arriving, departing, blocked, total: units.length };
  }, [unitStatuses, units.length]);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-3">
        <SummaryChip
          icon={<Building2 className="h-3.5 w-3.5" />}
          label={`${summary.occupied}/${summary.total} ${t("calendar.dayView.occupied")}`}
        />
        <SummaryChip
          icon={<LogIn className="h-3.5 w-3.5" />}
          label={`${summary.arriving} ${t("calendar.dayView.arriving")}`}
          variant="success"
        />
        <SummaryChip
          icon={<LogOut className="h-3.5 w-3.5" />}
          label={`${summary.departing} ${t("calendar.dayView.departing")}`}
          variant="warning"
        />
        {summary.blocked > 0 && (
          <SummaryChip
            icon={<Wrench className="h-3.5 w-3.5" />}
            label={`${summary.blocked} ${t("calendar.dayView.blocked")}`}
            variant="destructive"
          />
        )}
      </div>

      {/* Unit rows */}
      <div className="space-y-2">
        {unitStatuses.map(({ unit, bookings: unitBookings, maintenance, isArriving, isDeparting, arriving, departing }) => (
          <Card
            key={unit.id}
            className={`transition-colors ${
              maintenance
                ? "border-destructive/30 bg-destructive/5"
                : unitBookings.length > 0
                  ? "border-primary/20"
                  : "cursor-pointer hover:border-primary/30 hover:bg-primary/5"
            }`}
            onClick={() => {
              if (unitBookings.length > 0 && onBookingClick) {
                onBookingClick(unitBookings[0].id);
              } else if (!maintenance && onAvailableClick) {
                onAvailableClick(unit.id, dateStr);
              }
            }}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-sm text-foreground truncate">
                    {unit.name}
                  </span>
                  {isArriving && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-success/50 text-success shrink-0">
                      <LogIn className="h-2.5 w-2.5 mr-0.5" />
                      {t("calendar.dayView.checkIn")}
                    </Badge>
                  )}
                  {isDeparting && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-warning/50 text-warning shrink-0">
                      <LogOut className="h-2.5 w-2.5 mr-0.5" />
                      {t("calendar.dayView.checkOut")}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {maintenance ? (
                    <Badge variant="destructive" className="text-[10px]">
                      <Wrench className="h-3 w-3 mr-0.5" />
                      {t("calendar.maintenance")}
                    </Badge>
                  ) : unitBookings.length > 0 ? (
                    <Badge className={STATE_VARIANTS[unitBookings[0].state as BookingState] ?? ""}>
                      {t(`states.${unitBookings[0].state}`)}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("calendar.available")}
                    </span>
                  )}
                </div>
              </div>

              {/* Guest info for booked units */}
              {unitBookings.length > 0 && (
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {unitBookings.map((b) => (
                    <div key={b.id} className="flex items-center gap-1.5">
                      <UserCheck className="h-3 w-3" />
                      <span>
                        {resolveGuestDisplayName(b as any)} ·{" "}
                        {format(new Date(b.check_in), "MMM d")}–
                        {format(new Date(b.check_out), "MMM d")}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Maintenance reason */}
              {maintenance?.reason && (
                <p className="mt-1 text-xs text-muted-foreground italic">
                  {maintenance.reason}
                </p>
              )}
            </CardContent>
          </Card>
        ))}

        {units.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
            {t("reports.noUnits")}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryChip({
  icon,
  label,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  variant?: "success" | "warning" | "destructive";
}) {
  const colorClass =
    variant === "success"
      ? "bg-success/10 text-success"
      : variant === "warning"
        ? "bg-warning/10 text-warning"
        : variant === "destructive"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground";

  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}
    >
      {icon}
      {label}
    </div>
  );
}
