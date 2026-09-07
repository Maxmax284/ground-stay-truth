/**
 * OPERATIONAL — room shuffle (move a booking to another unit).
 *
 * One law here: the booking's STORED check-in / check-out dates are the source
 * of truth. Nothing in this module cares about what the calendar happens to be
 * showing. A booking bar clipped by the visible date window is still a fully
 * valid booking and must remain movable.
 *
 * Same collision rules as the booking engine: active bookings on the target
 * unit and maintenance blocks. Nothing weaker.
 */
import { supabase } from "@/integrations/supabase/client";
import { logOverrideEvent } from "@/lib/overrideAudit";
import { formatCampShort } from "@/lib/timezone";
import type { AppRole } from "@/lib/permissions";
import { permissions } from "@/lib/permissions";

/** Booking states that occupy a room and therefore block a move. */
export const ROOM_BLOCKING_STATES = [
  "pending_approval",
  "pending_deposit",
  "confirmed",
  "checked_in",
] as const;

export interface BookingDateRange {
  checkIn: string; // yyyy-MM-dd
  checkOut: string; // yyyy-MM-dd
}

export interface MoveConflict {
  kind: "booking" | "maintenance" | "unit_inactive";
  message: string;
  detail?: string;
  /** When the blocker is another booking, its id — enables a room swap. */
  blockingBookingId?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toDateKey(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const key = value.slice(0, 10);
  if (!DATE_RE.test(key)) return null;
  const d = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return key;
}

/**
 * Read the stored dates off a booking record. Returns null only when the
 * record genuinely cannot give us a usable stay — that is the only legitimate
 * reason to block a move on "dates".
 */
export function resolveBookingDates(
  booking: { check_in?: unknown; check_out?: unknown } | null | undefined
): BookingDateRange | null {
  if (!booking) return null;
  const checkIn = toDateKey(booking.check_in);
  const checkOut = toDateKey(booking.check_out);
  if (!checkIn || !checkOut) return null;
  if (checkOut <= checkIn) return null;
  return { checkIn, checkOut };
}

export function canMoveBookingRoom(role: AppRole | null): boolean {
  // Front desk and above may shuffle rooms; guests/viewers/maintenance may not.
  return permissions.canCreateBooking(role);
}

interface ConflictSources {
  bookings: Array<{
    id: string;
    unit_id: string;
    state: string;
    check_in: string;
    check_out: string;
    display?: string | null;
  }>;
  maintenanceBlocks: Array<{
    id: string;
    unit_id: string;
    start_date: string;
    end_date: string;
    reason?: string | null;
  }>;
}

/** Pure conflict check against already-loaded data. Half-open range [in, out). */
export function findRoomMoveConflict(
  args: {
    bookingId: string;
    targetUnitId: string;
    targetUnitName?: string | null;
    targetUnitActive?: boolean | null;
    dates: BookingDateRange;
  } & ConflictSources
): MoveConflict | null {
  const { bookingId, targetUnitId, targetUnitName, targetUnitActive, dates, bookings, maintenanceBlocks } = args;
  const room = targetUnitName ?? "That room";

  if (targetUnitActive === false) {
    return { kind: "unit_inactive", message: `${room} is out of service and cannot take bookings.` };
  }

  for (const b of bookings) {
    if (b.id === bookingId) continue;
    if (b.unit_id !== targetUnitId) continue;
    if (!(ROOM_BLOCKING_STATES as readonly string[]).includes(b.state)) continue;
    const bIn = b.check_in.slice(0, 10);
    const bOut = b.check_out.slice(0, 10);
    if (dates.checkIn < bOut && dates.checkOut > bIn) {
      return {
        kind: "booking",
        message: `${room} is not available for this booking's full stay.`,
        detail: `Conflicts with ${b.display ? `${b.display}, ` : ""}${bIn} – ${bOut}.`,
        blockingBookingId: b.id,
      };
    }
  }

  for (const mb of maintenanceBlocks) {
    if (mb.unit_id !== targetUnitId) continue;
    const start = mb.start_date.slice(0, 10);
    const endExclusive = addDayKey(mb.end_date.slice(0, 10), 1);
    if (dates.checkIn < endExclusive && dates.checkOut > start) {
      return {
        kind: "maintenance",
        message: `${room} is blocked for maintenance during this booking's stay.`,
        detail: `${start} – ${mb.end_date.slice(0, 10)}${mb.reason ? ` · ${mb.reason}` : ""}`,
      };
    }
  }

  return null;
}

function addDayKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface RoomMoveCheck {
  ok: boolean;
  dates?: BookingDateRange;
  conflict?: MoveConflict;
  error?: string;
}

/**
 * Server-side check. Loads the booking's own dates and the target unit's real
 * occupancy for that exact range — never the visible calendar slice.
 */
export async function checkRoomMove(bookingId: string, targetUnitId: string): Promise<RoomMoveCheck> {
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, check_in, check_out, unit_id, state")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError || !booking) {
    return { ok: false, error: "Could not move booking because the booking record could not be loaded." };
  }

  const dates = resolveBookingDates(booking);
  if (!dates) {
    return { ok: false, error: "Could not move booking because the booking dates could not be loaded." };
  }

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("id, name, is_active")
    .eq("id", targetUnitId)
    .maybeSingle();

  if (unitError || !unit) {
    return { ok: false, dates, error: "Could not move booking because the target room could not be verified." };
  }

  const [{ data: rival, error: rivalError }, { data: blocks, error: blockError }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, unit_id, state, check_in, check_out, manual_guest_name")
      .eq("unit_id", targetUnitId)
      .lt("check_in", dates.checkOut)
      .gt("check_out", dates.checkIn),
    supabase
      .from("maintenance_blocks")
      .select("id, unit_id, start_date, end_date, reason")
      .eq("unit_id", targetUnitId)
      .gte("end_date", dates.checkIn)
      .lte("start_date", dates.checkOut),
  ]);

  if (rivalError || blockError) {
    return { ok: false, dates, error: "Could not move booking because the availability check failed. Try again." };
  }

  const conflict = findRoomMoveConflict({
    bookingId,
    targetUnitId,
    targetUnitName: unit.name,
    targetUnitActive: (unit as { is_active?: boolean | null }).is_active ?? true,
    dates,
    bookings: (rival ?? []).map((b) => ({
      id: b.id,
      unit_id: b.unit_id,
      state: b.state as string,
      check_in: b.check_in,
      check_out: b.check_out,
      display: (b as { manual_guest_name?: string | null }).manual_guest_name ?? null,
    })),
    maintenanceBlocks: blocks ?? [],
  });

  if (conflict) return { ok: false, dates, conflict };
  return { ok: true, dates };
}

export interface RoomMoveInput {
  bookingId: string;
  fromUnitId: string | null;
  fromUnitName?: string | null;
  toUnitId: string;
  toUnitName?: string | null;
  guestName?: string | null;
  reason?: string | null;
  source: "calendar_drag_move" | "room_shuffle";
}

/**
 * Applies the move. Dates, guest, payments, documents, pickup, notes and state
 * are untouched — only `unit_id` changes.
 */
export async function applyRoomMove(input: RoomMoveInput): Promise<BookingDateRange> {
  const check = await checkRoomMove(input.bookingId, input.toUnitId);
  if (!check.ok) {
    throw new Error(check.conflict?.message ?? check.error ?? "Room move blocked.");
  }
  const dates = check.dates!;

  const { error } = await supabase
    .from("bookings")
    .update({ unit_id: input.toUnitId })
    .eq("id", input.bookingId);
  if (error) throw new Error(error.message);

  await logOverrideEvent({
    actionType: "booking_room_moved",
    targetType: "booking",
    targetId: input.bookingId,
    bookingId: input.bookingId,
    roomId: input.toUnitId,
    beforeState: {
      unit_id: input.fromUnitId,
      unit_name: input.fromUnitName ?? null,
      check_in: dates.checkIn,
      check_out: dates.checkOut,
    },
    afterState: {
      unit_id: input.toUnitId,
      unit_name: input.toUnitName ?? null,
      check_in: dates.checkIn,
      check_out: dates.checkOut,
    },
    reason: input.reason?.trim() || null,
    metadata: {
      guest: input.guestName ?? null,
      source: input.source,
      moved_at_camp_time: formatCampShort(new Date().toISOString()),
    },
  });

  return dates;
}

export interface RoomSwapInput {
  bookingId: string;
  otherBookingId: string;
  reason?: string | null;
}

/**
 * Swaps the rooms of two bookings in one server-side step. Needed when the two
 * stays overlap: moving them one at a time is always blocked, because each one
 * still occupies the room the other needs. Only `unit_id` changes on both.
 */
export async function swapBookingRooms(input: RoomSwapInput): Promise<void> {
  const { error } = await (supabase as any).rpc("swap_booking_rooms", {
    _booking_a: input.bookingId,
    _booking_b: input.otherBookingId,
    _reason: input.reason?.trim() || null,
  });
  if (error) throw new Error(error.message);
}
