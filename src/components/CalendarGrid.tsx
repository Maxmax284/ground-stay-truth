import { useMemo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { format, addDays, differenceInDays, isSameDay, startOfDay } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CircleDollarSign, CircleCheck, Circle, GripVertical, Percent } from "lucide-react";
import type { BookingState } from "@/lib/bookingStateMachine";
import type { Unit } from "@/hooks/useUnits";
import type { BookingWithJoins } from "@/hooks/useBookings";
import type { MaintenanceBlock } from "@/hooks/useMaintenanceBlocks";
import type { UnitGroup } from "@/hooks/useUnitGroups";
import { useCalendarDragDrop, type DragResult, type DragMode } from "@/hooks/useCalendarDragDrop";
import { toast } from "@/hooks/use-toast";
import { resolveGuestDisplayName, hasManualGuestIdentity } from "@/lib/guestDisplay";
import { PriceStoryBadge } from "@/components/PriceStoryBadge";
import type { DiscountFlag } from "@/hooks/usePriceStory";
import type { PolicySetting } from "@/hooks/usePolicySettings";

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
  canDragDrop?: boolean;
  onBookingDragEnd?: (result: DragResult) => void;
  onApplyDiscount?: (booking: BookingWithJoins) => void;
  onMaintenanceClick?: (block: MaintenanceBlock) => void;
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

const COL_WIDTH = 44;
const HEADER_HEIGHT = 56;
const ROW_HEIGHT = 48;
const LABEL_WIDTH = 160;
const GROUP_HEADER_HEIGHT = 32;

// States that should not be draggable
const NON_DRAGGABLE_STATES: string[] = ["completed", "cancelled", "no_show"];

export function CalendarGrid({
  units, bookings, maintenanceBlocks = [], startDate, days, cleaningBufferHours,
  onCellClick, onBookingClick, unitGroups = [], paymentSummaries = [],
  canDragDrop = false, onBookingDragEnd, onApplyDiscount, onMaintenanceClick,
}: CalendarGridProps) {
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

  // Flat list of units in render order (needed for row-based drag targeting)
  const flatUnits = useMemo(() => groupedUnits.flatMap((g) => g.units), [groupedUnits]);

  // Drag-and-drop
  const handleDragEnd = useCallback((result: DragResult) => {
    onBookingDragEnd?.(result);
  }, [onBookingDragEnd]);

  const {
    dragState,
    validationError,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useCalendarDragDrop({
    colWidth: COL_WIDTH,
    rowHeight: ROW_HEIGHT,
    groupHeaderHeight: GROUP_HEADER_HEIGHT,
    startDate,
    days,
    bookings,
    maintenanceBlocks,
    flatUnits,
    onDragEnd: handleDragEnd,
    enabled: canDragDrop,
  });

  // Show validation error as toast on drop
  const lastErrorRef = useRef<string | null>(null);
  if (validationError && validationError.message !== lastErrorRef.current && !dragState) {
    lastErrorRef.current = validationError.message;
    toast({ title: "Cannot move booking", description: validationError.message, variant: "destructive" });
    setTimeout(() => { lastErrorRef.current = null; }, 3500);
  }

  const getBarPreviewStyle = (booking: BookingWithJoins) => {
    if (!dragState || dragState.bookingId !== booking.id) return null;

    const checkIn = startOfDay(new Date(booking.check_in));
    const checkOut = startOfDay(new Date(booking.check_out));
    const gridStart = startOfDay(startDate);

    let newCheckIn = checkIn;
    let newCheckOut = checkOut;
    let targetUnitId = booking.unit_id;

    if (dragState.mode === "move") {
      newCheckIn = addDays(checkIn, dragState.dayOffset);
      newCheckOut = addDays(checkOut, dragState.dayOffset);
      targetUnitId = dragState.targetUnitId;
    } else {
      newCheckOut = addDays(checkOut, dragState.resizeDelta);
    }

    const barStartOffset = Math.max(0, differenceInDays(newCheckIn, gridStart));
    const barEndOffset = Math.min(days, differenceInDays(newCheckOut, gridStart));
    const barWidth = barEndOffset - barStartOffset;

    // Calculate row position change
    const originalRowIdx = flatUnits.findIndex((u) => u.id === booking.unit_id);
    const targetRowIdx = flatUnits.findIndex((u) => u.id === targetUnitId);
    const rowDelta = targetRowIdx - originalRowIdx;

    return {
      left: barStartOffset * COL_WIDTH + 2,
      width: Math.max(COL_WIDTH - 4, barWidth * COL_WIDTH - 4),
      top: 8 + rowDelta * ROW_HEIGHT,
      isValid: !validationError,
    };
  };

  const renderBookingBar = (booking: BookingWithJoins, unit: Unit) => {
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
    const isDragging = dragState?.bookingId === booking.id;
    const isDraggable = canDragDrop && !NON_DRAGGABLE_STATES.includes(booking.state);
    const previewStyle = isDragging ? getBarPreviewStyle(booking) : null;

    return (
      <Tooltip key={booking.id}>
        <TooltipTrigger asChild>
          <div
            className={`group/booking absolute rounded-md ${color} flex items-center gap-1 px-1.5 overflow-hidden transition-shadow select-none ${
              isDragging
                ? `z-30 shadow-lg ring-2 ${previewStyle?.isValid ? "ring-primary" : "ring-destructive"} opacity-90`
                : isDraggable
                  ? "cursor-grab hover:opacity-80 hover:shadow-md"
                  : "cursor-pointer hover:opacity-80"
            }`}
            style={{
              left: previewStyle ? previewStyle.left : barStartOffset * COL_WIDTH + 2,
              width: previewStyle ? previewStyle.width : barWidth * COL_WIDTH - 4,
              top: previewStyle ? previewStyle.top : 8,
              height: ROW_HEIGHT - 16,
              transition: isDragging ? "none" : "opacity 0.15s, box-shadow 0.15s",
            }}
            onClick={(e) => {
              if (isDragging) return;
              e.stopPropagation();
              onBookingClick?.(booking.id);
            }}
            onPointerDown={(e) => {
              if (!isDraggable) return;
              // Check if clicking on resize handle
              const rect = (e.target as HTMLElement).closest("[data-booking-bar]")?.getBoundingClientRect();
              if (!rect) {
                handlePointerDown(e, booking, "move");
                return;
              }
              const isRightEdge = e.clientX > rect.right - 12;
              handlePointerDown(e, booking, isRightEdge ? "resize" : "move");
            }}
            onPointerMove={isDragging ? handlePointerMove : undefined}
            onPointerUp={isDragging ? handlePointerUp : undefined}
            data-booking-bar
          >
            {isDraggable && (
              <GripVertical className="h-3 w-3 shrink-0 text-foreground/30" />
            )}
            <PaymentBadge status={paymentStatus} />
            <span className="text-[11px] font-medium text-foreground truncate">
              {barWidth > 2
                ? (booking.profiles?.full_name || hasManualGuestIdentity(booking as any)
                    ? resolveGuestDisplayName(booking as any).split(" ")[0]
                    : `${format(checkIn, "d")}–${format(checkOut, "d")}`)
                : ""}
            </span>
            {/* Quick discount overlay — only for unpaid non-terminal bookings when handler is wired */}
            {onApplyDiscount && paymentStatus === "unpaid"
              && !["cancelled", "completed", "no_show"].includes(booking.state as string) && (
              <button
                type="button"
                aria-label="Apply discount"
                title="Apply discount"
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border border-border shadow-sm flex items-center justify-center opacity-0 group-hover/booking:opacity-100 hover:bg-primary hover:text-primary-foreground transition-opacity z-10"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onApplyDiscount(booking); }}
              >
                <Percent className="h-2.5 w-2.5" />
              </button>
            )}
            {/* Resize handle */}
            {isDraggable && (
              <div
                className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-foreground/10 rounded-r-md"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  handlePointerDown(e, booking, "resize");
                }}
                onPointerMove={isDragging && dragState?.mode === "resize" ? handlePointerMove : undefined}
                onPointerUp={isDragging && dragState?.mode === "resize" ? handlePointerUp : undefined}
              />
            )}
          </div>
        </TooltipTrigger>
        {!isDragging && (
          <TooltipContent side="top" className="max-w-xs">
            <p className="font-medium">{unit.name}</p>
            {(booking.profiles?.full_name || hasManualGuestIdentity(booking as any)) && (
              <p className="text-xs font-medium">{resolveGuestDisplayName(booking as any)}</p>
            )}
            <p className="text-xs">{format(checkIn, "MMM d")} → {format(checkOut, "MMM d, yyyy")}</p>
            <p className="text-xs">{t(`states.${booking.state}`)} · {t("bookings.guestCount", { count: booking.num_guests })}</p>
            <p className="text-xs mt-0.5">
              {paymentStatus === "fully_paid" ? "✅ Fully Paid" : paymentStatus === "deposit" ? "💰 Deposit Paid" : "⚪ Unpaid"}
            </p>
            {isDraggable && <p className="text-[10px] text-muted-foreground mt-1">Drag to move · Drag right edge to resize</p>}
          </TooltipContent>
        )}
      </Tooltip>
    );
  };

  const renderUnitRow = (unit: Unit) => {
    const unitBookings = bookingsByUnit.get(unit.id) ?? [];
    const unitBlocks = blocksByUnit.get(unit.id) ?? [];
    return (
      <div key={unit.id} className="flex border-b last:border-b-0">
        <div className="shrink-0 border-r flex items-center px-3 text-sm font-medium truncate sticky left-0 z-10 bg-card" style={{ width: LABEL_WIDTH, height: ROW_HEIGHT }} title={unit.name}>{unit.name}</div>
        <div className="relative flex" style={{ height: ROW_HEIGHT }}>
          {dates.map((d, i) => {
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return <div key={i} className={`shrink-0 border-r cursor-pointer hover:bg-primary/5 transition-colors ${isWeekend ? "bg-accent/10" : ""}`} style={{ width: COL_WIDTH, height: ROW_HEIGHT }} onClick={() => onCellClick?.(unit.id, format(d, "yyyy-MM-dd"))} />;
          })}
          {/* Booking bars */}
          {unitBookings.map((booking) => renderBookingBar(booking, unit))}
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
                <TooltipTrigger asChild><div className="absolute top-2 rounded-sm opacity-50" style={{ left: barStartOffset * COL_WIDTH + 2, width: barWidth * COL_WIDTH - 4, height: ROW_HEIGHT - 16, backgroundImage: "repeating-linear-gradient(45deg, hsl(var(--muted-foreground) / 0.1), hsl(var(--muted-foreground) / 0.1) 3px, hsl(var(--muted) / 0.8) 3px, hsl(var(--muted) / 0.8) 6px)" }} /></TooltipTrigger>
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
                <TooltipTrigger asChild><div role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onMaintenanceClick?.(block); }} className="absolute top-1 rounded-sm cursor-pointer" style={{ left: barStartOffset * COL_WIDTH + 2, width: barWidth * COL_WIDTH - 4, height: ROW_HEIGHT - 8, backgroundImage: "repeating-linear-gradient(45deg, hsl(var(--destructive) / 0.15), hsl(var(--destructive) / 0.15) 3px, hsl(var(--destructive) / 0.05) 3px, hsl(var(--destructive) / 0.05) 6px)", border: "1px dashed hsl(var(--destructive) / 0.4)" }} /></TooltipTrigger>
                <TooltipContent side="top"><p className="text-xs font-medium">{t("calendar.maintenance")}</p>{block.reason && <p className="text-xs text-muted-foreground">{block.reason}</p>}<p className="text-xs text-muted-foreground">{format(blockStart, "MMM d")} – {format(new Date(block.end_date), "MMM d")}</p><p className="text-xs text-muted-foreground">Click to remove or mark resolved</p></TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    );
  };

  // Room type summary
  const groupSummary = useMemo(() => {
    if (groupedUnits.length <= 1 && !groupedUnits[0]?.group) return null;
    return groupedUnits
      .filter(g => g.group)
      .map(g => `${g.units.length}× ${g.group!.name}`)
      .join(" · ");
  }, [groupedUnits]);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {groupSummary && (
        <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{groupSummary}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{units.length} {t("units.title").toLowerCase()}</span>
        </div>
      )}
      {canDragDrop && (
        <div className="px-3 py-1.5 border-b bg-accent/10 flex items-center gap-2 text-xs text-muted-foreground">
          <GripVertical className="h-3.5 w-3.5" />
          <span>Drag bookings to move, resize, or reassign rooms</span>
        </div>
      )}
      <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-16rem)]">
        <div style={{ minWidth: LABEL_WIDTH + COL_WIDTH * days }}>
          {/* Header row - sticky so dates stay visible while scrolling through units */}
          <div className="flex border-b sticky top-0 z-20 bg-card shadow-sm">
            <div className="shrink-0 border-r bg-card flex items-end px-3 pb-2 text-xs font-medium text-muted-foreground sticky left-0 z-30" style={{ width: LABEL_WIDTH, height: HEADER_HEIGHT }}>{t("units.title")}</div>
            {dates.map((d, i) => {
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              const isToday = isSameDay(d, new Date());
              return (
                <div key={i} className={`shrink-0 border-r flex flex-col items-center justify-end pb-1 text-xs ${isWeekend ? "bg-accent/30" : ""} ${isToday ? "bg-primary/10 font-bold" : ""}`} style={{ width: COL_WIDTH, height: HEADER_HEIGHT }}>
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
              {group && (
                <div className="flex border-b bg-accent/20">
                  <div className="sticky left-0 z-10 shrink-0 flex items-center px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ height: GROUP_HEADER_HEIGHT, minWidth: LABEL_WIDTH }}>
                    {group.name}
                    <span className="ml-2 text-[10px] font-normal lowercase">({groupUnits.length})</span>
                  </div>
                </div>
              )}
              {!group && groupedUnits.length > 1 && (
                <div className="flex border-b bg-accent/20">
                  <div className="sticky left-0 z-10 shrink-0 flex items-center px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ height: GROUP_HEADER_HEIGHT, minWidth: LABEL_WIDTH }}>
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
