import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format, addDays, differenceInDays, isSameDay, startOfDay } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CircleDollarSign, CircleCheck, Circle } from "lucide-react";
import type { BookingState } from "@/lib/bookingStateMachine";
import type { Unit } from "@/hooks/useUnits";
import type { BookingWithJoins } from "@/hooks/useBookings";
import type { MaintenanceBlock } from "@/hooks/useMaintenanceBlocks";
import type { UnitGroup } from "@/hooks/useUnitGroups";

export const CALENDAR_STATE_COLORS: Record<BookingState, string> = {
  inquiry: "bg-muted", soft_hold: "bg-warning/60", pending_approval: "bg-warning/80",
  pending_deposit: "bg-warning", confirmed: "bg-success", checked_in: "bg-info",
  completed: "bg-secondary", cancelled: "bg-destructive/30", no_show: "bg-destructive/50",
};

export type PaymentSummary = { booking_id: string; total_paid: number };

interface CalendarGridProps {
  units: Unit[];
  bookings: BookingWithJoins[];
  maintenanceBlocks?: MaintenanceBlock[];
  startDate: Date;
  days: number;
  cleaningBufferHours: number;
  onCellClick?: (unitId: string, date: string) => void;
  onBookingClick?: (bookingId: string) => void;
  unitGroups?: UnitGroup[];
  paymentSummaries?: PaymentSummary[];
}

function getPaymentStatus(booking: BookingWithJoins, totalPaid: number): "unpaid" | "deposit" | "fully_paid" {
  if (totalPaid <= 0) return "unpaid";
  const totalPrice = booking.total_price ?? 0;
  if (totalPrice > 0 && totalPaid >= totalPrice) return "fully_paid";
  return "deposit";
}

function PaymentBadge({ status }: { status: "unpaid" | "deposit" | "fully_paid" }) {
  if (status === "fully_paid") return <CircleCheck className="h-3 w-3 shrink-0 text-emerald-700 dark:text-emerald-400" />;
  if (status === "deposit") return <CircleDollarSign className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />;
  return <Circle className="h-3 w-3 shrink-0 text-muted-foreground/50" />;
}

export function CalendarGrid({ units, bookings, maintenanceBlocks = [], startDate, days, cleaningBufferHours, onCellClick, onBookingClick, unitGroups = [], paymentSummaries = [] }: CalendarGridProps) {
  const { t } = useTranslation();
  const dates = useMemo(() => Array.from({ length: days }, (_, i) => addDays(startDate, i)), [startDate, days]);
  const cleaningBufferDays = Math.ceil(cleaningBufferHours / 24);

  const bookingsByUnit = useMemo(() => {
    const map = new Map<string, typeof bookings>();
    for (const b of bookings) { const list = map.get(b.unit_id) ?? []; list.push(b); map.set(b.unit_id, list); }
    return map;
  }, [bookings]);

  const blocksByUnit = useMemo(() => {
    const map = new Map<string, MaintenanceBlock[]>();
    for (const mb of maintenanceBlocks) { const list = map.get(mb.unit_id) ?? []; list.push(mb); map.set(mb.unit_id, list); }
    return map;
  }, [maintenanceBlocks]);

  const paymentMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const ps of paymentSummaries) map.set(ps.booking_id, ps.total_paid);
    return map;
  }, [paymentSummaries]);

  // Group units by unit_groups, with ungrouped at the end
  const groupedUnits = useMemo(() => {
    const groups: { group: UnitGroup | null; units: Unit[] }[] = [];
    const activeGroups = unitGroups.filter((g) => g.is_active).sort((a, b) => a.sort_order - b.sort_order);

    for (const group of activeGroups) {
      const groupUnits = units.filter((u) => u.group_id === group.id).sort((a, b) => a.name.localeCompare(b.name));
      if (groupUnits.length > 0) groups.push({ group, units: groupUnits });
    }

    const ungrouped = units.filter((u) => !u.group_id || !activeGroups.some((g) => g.id === u.group_id)).sort((a, b) => a.name.localeCompare(b.name));
    if (ungrouped.length > 0) groups.push({ group: null, units: ungrouped });

    return groups;
  }, [units, unitGroups]);

  const colWidth = 44; const headerHeight = 56; const rowHeight = 48; const labelWidth = 160; const groupHeaderHeight = 32;

  const renderUnitRow = (unit: Unit) => {
    const unitBookings = bookingsByUnit.get(unit.id) ?? [];
    const unitBlocks = blocksByUnit.get(unit.id) ?? [];
    return (
      <div key={unit.id} className="flex border-b last:border-b-0">
        <div className="shrink-0 border-r flex items-center px-3 text-sm font-medium truncate" style={{ width: labelWidth, height: rowHeight }} title={unit.name}>{unit.name}</div>
        <div className="relative flex" style={{ height: rowHeight }}>
          {dates.map((d, i) => {
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return <div key={i} className={`shrink-0 border-r cursor-pointer hover:bg-primary/5 transition-colors ${isWeekend ? "bg-accent/10" : ""}`} style={{ width: colWidth, height: rowHeight }} onClick={() => onCellClick?.(unit.id, format(d, "yyyy-MM-dd"))} />;
          })}
          {/* Booking bars */}
          {unitBookings.map((booking) => {
            const checkIn = startOfDay(new Date(booking.check_in));
            const checkOut = startOfDay(new Date(booking.check_out));
            const gridStart = startOfDay(startDate);
            const gridEnd = addDays(gridStart, days);
            if (checkOut <= gridStart || checkIn >= gridEnd) return null;
            const barStartOffset = Math.max(0, differenceInDays(checkIn, gridStart));
            const barEndOffset = Math.min(days, differenceInDays(checkOut, gridStart));
            const barWidth = barEndOffset - barStartOffset;
            if (barWidth <= 0) return null;
            const color = CALENDAR_STATE_COLORS[booking.state as BookingState] ?? "bg-muted";
            const totalPaid = paymentMap.get(booking.id) ?? 0;
            const paymentStatus = getPaymentStatus(booking, totalPaid);
            return (
              <Tooltip key={booking.id}>
                <TooltipTrigger asChild>
                  <div className={`absolute top-2 rounded-md ${color} cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1 px-1.5 overflow-hidden`} style={{ left: barStartOffset * colWidth + 2, width: barWidth * colWidth - 4, height: rowHeight - 16 }} onClick={(e) => { e.stopPropagation(); onBookingClick?.(booking.id); }}>
                    <PaymentBadge status={paymentStatus} />
                    <span className="text-[11px] font-medium text-foreground truncate">
                      {barWidth > 2 ? (booking.profiles?.full_name ? booking.profiles.full_name.split(" ")[0] : `${format(checkIn, "d")}–${format(checkOut, "d")}`) : ""}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="font-medium">{unit.name}</p>
                  {booking.profiles?.full_name && <p className="text-xs font-medium">{booking.profiles.full_name}</p>}
                  <p className="text-xs">{format(checkIn, "MMM d")} → {format(checkOut, "MMM d, yyyy")}</p>
                  <p className="text-xs">{t(`states.${booking.state}`)} · {t("bookings.guestCount", { count: booking.num_guests })}</p>
                  <p className="text-xs mt-0.5">
                    {paymentStatus === "fully_paid" ? "✅ Fully Paid" : paymentStatus === "deposit" ? "💰 Deposit Paid" : "⚪ Unpaid"}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
          {/* Cleaning buffers */}
          {unitBookings.filter((b) => ["completed", "checked_in"].includes(b.state)).map((booking) => {
            const checkOut = startOfDay(new Date(booking.check_out));
            const gridStart = startOfDay(startDate); const gridEnd = addDays(gridStart, days);
            const bufferStart = checkOut; const bufferEnd = addDays(checkOut, cleaningBufferDays);
            if (bufferStart >= gridEnd || bufferEnd <= gridStart) return null;
            const barStartOffset = Math.max(0, differenceInDays(bufferStart, gridStart));
            const barEndOffset = Math.min(days, differenceInDays(bufferEnd, gridStart));
            const barWidth = barEndOffset - barStartOffset;
            if (barWidth <= 0) return null;
            return (
              <Tooltip key={`buffer-${booking.id}`}>
                <TooltipTrigger asChild><div className="absolute top-2 rounded-sm opacity-50" style={{ left: barStartOffset * colWidth + 2, width: barWidth * colWidth - 4, height: rowHeight - 16, backgroundImage: "repeating-linear-gradient(45deg, hsl(var(--muted-foreground) / 0.1), hsl(var(--muted-foreground) / 0.1) 3px, hsl(var(--muted) / 0.8) 3px, hsl(var(--muted) / 0.8) 6px)" }} /></TooltipTrigger>
                <TooltipContent side="top"><p className="text-xs">{t("calendar.cleaningBuffer")} ({cleaningBufferHours}h)</p></TooltipContent>
              </Tooltip>
            );
          })}
          {/* Maintenance blocks */}
          {unitBlocks.map((block) => {
            const blockStart = startOfDay(new Date(block.start_date));
            const blockEnd = addDays(startOfDay(new Date(block.end_date)), 1);
            const gridStart = startOfDay(startDate); const gridEnd = addDays(gridStart, days);
            if (blockStart >= gridEnd || blockEnd <= gridStart) return null;
            const barStartOffset = Math.max(0, differenceInDays(blockStart, gridStart));
            const barEndOffset = Math.min(days, differenceInDays(blockEnd, gridStart));
            const barWidth = barEndOffset - barStartOffset;
            if (barWidth <= 0) return null;
            return (
              <Tooltip key={`maint-${block.id}`}>
                <TooltipTrigger asChild><div className="absolute top-1 rounded-sm" style={{ left: barStartOffset * colWidth + 2, width: barWidth * colWidth - 4, height: rowHeight - 8, backgroundImage: "repeating-linear-gradient(45deg, hsl(var(--destructive) / 0.15), hsl(var(--destructive) / 0.15) 3px, hsl(var(--destructive) / 0.05) 3px, hsl(var(--destructive) / 0.05) 6px)", border: "1px dashed hsl(var(--destructive) / 0.4)" }} /></TooltipTrigger>
                <TooltipContent side="top"><p className="text-xs font-medium">{t("calendar.maintenance")}</p>{block.reason && <p className="text-xs text-muted-foreground">{block.reason}</p>}<p className="text-xs text-muted-foreground">{format(blockStart, "MMM d")} – {format(new Date(block.end_date), "MMM d")}</p></TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: labelWidth + colWidth * days }}>
          {/* Header row */}
          <div className="flex border-b sticky top-0 z-10 bg-card">
            <div className="shrink-0 border-r bg-card flex items-end px-3 pb-2 text-xs font-medium text-muted-foreground" style={{ width: labelWidth, height: headerHeight }}>{t("units.title")}</div>
            {dates.map((d, i) => {
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              const isToday = isSameDay(d, new Date());
              return (
                <div key={i} className={`shrink-0 border-r flex flex-col items-center justify-end pb-1 text-xs ${isWeekend ? "bg-accent/30" : ""} ${isToday ? "bg-primary/10 font-bold" : ""}`} style={{ width: colWidth, height: headerHeight }}>
                  <span className="text-muted-foreground">{format(d, "EEE")}</span>
                  <span className={isToday ? "text-primary" : "text-foreground"}>{format(d, "d")}</span>
                  {(i === 0 || d.getDate() === 1) && <span className="text-[10px] text-muted-foreground">{format(d, "MMM")}</span>}
                </div>
              );
            })}
          </div>

          {/* Grouped unit rows */}
          {groupedUnits.map(({ group, units: groupUnits }) => (
            <div key={group?.id ?? "ungrouped"}>
              {/* Group header */}
              {group && (
                <div className="flex border-b bg-accent/20">
                  <div className="flex items-center px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ height: groupHeaderHeight }}>
                    {group.name}
                    <span className="ml-2 text-[10px] font-normal lowercase">({groupUnits.length})</span>
                  </div>
                </div>
              )}
              {!group && groupedUnits.length > 1 && (
                <div className="flex border-b bg-accent/20">
                  <div className="flex items-center px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ height: groupHeaderHeight }}>
                    Other Rooms
                    <span className="ml-2 text-[10px] font-normal lowercase">({groupUnits.length})</span>
                  </div>
                </div>
              )}
              {groupUnits.map(renderUnitRow)}
            </div>
          ))}

          {units.length === 0 && <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">{t("reports.noUnits")}</div>}
        </div>
      </div>
    </div>
  );
}
