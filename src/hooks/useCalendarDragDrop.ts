import { useState, useCallback, useRef } from "react";
import { addDays, differenceInDays, startOfDay, format } from "date-fns";
import type { BookingWithJoins } from "@/hooks/useBookings";
import type { MaintenanceBlock } from "@/hooks/useMaintenanceBlocks";
import type { Unit } from "@/hooks/useUnits";

export type DragMode = "move" | "resize";

export interface DragState {
  bookingId: string;
  mode: DragMode;
  /** Original booking data for reference */
  originalCheckIn: Date;
  originalCheckOut: Date;
  originalUnitId: string;
  /** Current preview values (in day offsets from original) */
  dayOffset: number;
  /** For resize mode: change in days for check-out */
  resizeDelta: number;
  /** For room reassign: target unit id */
  targetUnitId: string;
  /** Starting pointer X in px */
  startX: number;
  /** Starting pointer Y in px */
  startY: number;
}

export interface DragResult {
  bookingId: string;
  newCheckIn: string;
  newCheckOut: string;
  newUnitId: string;
}

export interface ValidationError {
  type: "overlap" | "maintenance" | "min_nights" | "out_of_bounds";
  message: string;
}

interface UseCalendarDragDropOptions {
  colWidth: number;
  rowHeight: number;
  groupHeaderHeight: number;
  startDate: Date;
  days: number;
  bookings: BookingWithJoins[];
  maintenanceBlocks: MaintenanceBlock[];
  /** Flat ordered list of units as rendered (accounting for groups) */
  flatUnits: Unit[];
  onDragEnd: (result: DragResult) => void;
  enabled: boolean;
}

export function useCalendarDragDrop({
  colWidth,
  rowHeight,
  groupHeaderHeight,
  startDate,
  days,
  bookings,
  maintenanceBlocks,
  flatUnits,
  onDragEnd,
  enabled,
}: UseCalendarDragDropOptions) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [validationError, setValidationError] = useState<ValidationError | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, booking: BookingWithJoins, mode: DragMode) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const state: DragState = {
        bookingId: booking.id,
        mode,
        originalCheckIn: startOfDay(new Date(booking.check_in)),
        originalCheckOut: startOfDay(new Date(booking.check_out)),
        originalUnitId: booking.unit_id,
        dayOffset: 0,
        resizeDelta: 0,
        targetUnitId: booking.unit_id,
        startX: e.clientX,
        startY: e.clientY,
      };
      dragRef.current = state;
      setDragState(state);
      setValidationError(null);
    },
    [enabled]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const ds = dragRef.current;
      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;

      const dayOffset = ds.mode === "move" ? Math.round(dx / colWidth) : 0;
      const resizeDelta = ds.mode === "resize" ? Math.round(dx / colWidth) : 0;

      // Calculate row offset for room reassignment (move mode only)
      let targetUnitId = ds.originalUnitId;
      if (ds.mode === "move" && flatUnits.length > 1) {
        const originalIdx = flatUnits.findIndex((u) => u.id === ds.originalUnitId);
        const rowOffset = Math.round(dy / rowHeight);
        const targetIdx = Math.max(0, Math.min(flatUnits.length - 1, originalIdx + rowOffset));
        targetUnitId = flatUnits[targetIdx].id;
      }

      const updated: DragState = { ...ds, dayOffset, resizeDelta, targetUnitId };
      dragRef.current = updated;
      setDragState(updated);

      // Live validation
      const newCheckIn = ds.mode === "move" ? addDays(ds.originalCheckIn, dayOffset) : ds.originalCheckIn;
      const newCheckOut = ds.mode === "resize" ? addDays(ds.originalCheckOut, resizeDelta) : addDays(ds.originalCheckOut, dayOffset);
      const gridStart = startOfDay(startDate);

      const err = validate(newCheckIn, newCheckOut, targetUnitId, ds.bookingId, gridStart, days, bookings, maintenanceBlocks, flatUnits);
      setValidationError(err);
    },
    [colWidth, rowHeight, startDate, days, bookings, maintenanceBlocks, flatUnits]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      const ds = dragRef.current;

      const newCheckIn = ds.mode === "move" ? addDays(ds.originalCheckIn, ds.dayOffset) : ds.originalCheckIn;
      const newCheckOut = ds.mode === "resize" ? addDays(ds.originalCheckOut, ds.resizeDelta) : addDays(ds.originalCheckOut, ds.dayOffset);
      const gridStart = startOfDay(startDate);

      const err = validate(newCheckIn, newCheckOut, ds.targetUnitId, ds.bookingId, gridStart, days, bookings, maintenanceBlocks, flatUnits);

      if (!err && (ds.dayOffset !== 0 || ds.resizeDelta !== 0 || ds.targetUnitId !== ds.originalUnitId)) {
        onDragEnd({
          bookingId: ds.bookingId,
          newCheckIn: format(newCheckIn, "yyyy-MM-dd"),
          newCheckOut: format(newCheckOut, "yyyy-MM-dd"),
          newUnitId: ds.targetUnitId,
        });
      }

      dragRef.current = null;
      setDragState(null);
      // Keep validation error briefly so toast can show it
      if (err) setTimeout(() => setValidationError(null), 3000);
      else setValidationError(null);
    },
    [startDate, days, bookings, maintenanceBlocks, flatUnits, onDragEnd]
  );

  const cancelDrag = useCallback(() => {
    dragRef.current = null;
    setDragState(null);
    setValidationError(null);
  }, []);

  return {
    dragState,
    validationError,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    cancelDrag,
  };
}

function validate(
  checkIn: Date,
  checkOut: Date,
  unitId: string,
  bookingId: string,
  gridStart: Date,
  days: number,
  bookings: BookingWithJoins[],
  maintenanceBlocks: MaintenanceBlock[],
  flatUnits: Unit[]
): ValidationError | null {
  const nights = differenceInDays(checkOut, checkIn);
  if (nights < 1) return { type: "min_nights", message: "Stay must be at least 1 night" };

  const original = bookings.find((b) => b.id === bookingId);
  const datesChanged =
    !original ||
    format(checkIn, "yyyy-MM-dd") !== original.check_in.slice(0, 10) ||
    format(checkOut, "yyyy-MM-dd") !== original.check_out.slice(0, 10);

  // Minimum-nights only applies when the stay length is actually being changed.
  // A pure room move keeps the stored dates and must never be blocked by it.
  const unit = flatUnits.find((u) => u.id === unitId);
  if (datesChanged && unit && nights < unit.min_nights) {
    return { type: "min_nights", message: `Minimum ${unit.min_nights} nights required for ${unit.name}` };
  }

  // NOTE: no viewport/range check here on purpose. The booking's stored dates
  // are the source of truth — a bar clipped by the visible window is still a
  // valid booking and must stay movable.

  // Check overlap with other bookings on same unit
  const activeStates = ["pending_approval", "pending_deposit", "confirmed", "checked_in"];
  for (const b of bookings) {
    if (b.id === bookingId || b.unit_id !== unitId) continue;
    if (!activeStates.includes(b.state)) continue;
    const bIn = startOfDay(new Date(b.check_in));
    const bOut = startOfDay(new Date(b.check_out));
    if (checkIn < bOut && checkOut > bIn) {
      return { type: "overlap", message: `${unit?.name ?? "That room"} is not available for this booking's full stay (${format(bIn, "MMM d")}–${format(bOut, "MMM d")} is taken).` };
    }
  }

  // Check maintenance blocks
  for (const mb of maintenanceBlocks) {
    if (mb.unit_id !== unitId) continue;
    const mbStart = startOfDay(new Date(mb.start_date));
    const mbEnd = addDays(startOfDay(new Date(mb.end_date)), 1);
    if (checkIn < mbEnd && checkOut > mbStart) {
      return { type: "maintenance", message: `${unit?.name ?? "That room"} is blocked for maintenance (${format(mbStart, "MMM d")}–${format(new Date(mb.end_date), "MMM d")}).` };
    }
  }

  return null;
}

