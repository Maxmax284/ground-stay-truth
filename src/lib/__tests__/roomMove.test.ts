import { describe, it, expect } from "vitest";
import { resolveBookingDates, findRoomMoveConflict, canMoveBookingRoom } from "@/lib/roomMove";

const dates = { checkIn: "2026-08-01", checkOut: "2026-08-20" };

describe("resolveBookingDates", () => {
  it("reads stored dates regardless of what the calendar shows", () => {
    expect(resolveBookingDates({ check_in: "2026-08-01", check_out: "2026-08-20T00:00:00Z" })).toEqual(dates);
  });

  it("blocks only when dates are missing or invalid", () => {
    expect(resolveBookingDates({ check_in: null, check_out: "2026-08-20" })).toBeNull();
    expect(resolveBookingDates({ check_in: "2026-08-20", check_out: "2026-08-01" })).toBeNull();
    expect(resolveBookingDates(null)).toBeNull();
  });
});

describe("findRoomMoveConflict", () => {
  const base = {
    bookingId: "b1",
    targetUnitId: "u13",
    targetUnitName: "Room 13",
    targetUnitActive: true,
    dates,
    bookings: [] as any[],
    maintenanceBlocks: [] as any[],
  };

  it("allows a long stay that is clipped in the visible window", () => {
    expect(findRoomMoveConflict(base)).toBeNull();
  });

  it("blocks on an overlapping active booking", () => {
    const conflict = findRoomMoveConflict({
      ...base,
      bookings: [{ id: "b2", unit_id: "u13", state: "confirmed", check_in: "2026-08-05", check_out: "2026-08-08", display: "Shabs" }],
    });
    expect(conflict?.kind).toBe("booking");
    expect(conflict?.message).toContain("Room 13 is not available");
  });

  it("ignores cancelled bookings and the booking being moved", () => {
    expect(
      findRoomMoveConflict({
        ...base,
        bookings: [
          { id: "b2", unit_id: "u13", state: "cancelled", check_in: "2026-08-05", check_out: "2026-08-08" },
          { id: "b1", unit_id: "u13", state: "confirmed", check_in: "2026-08-01", check_out: "2026-08-20" },
        ],
      })
    ).toBeNull();
  });

  it("blocks on maintenance blocks", () => {
    const conflict = findRoomMoveConflict({
      ...base,
      maintenanceBlocks: [{ id: "m1", unit_id: "u13", start_date: "2026-08-10", end_date: "2026-08-11", reason: "Aircon" }],
    });
    expect(conflict?.kind).toBe("maintenance");
  });

  it("blocks on out-of-service units", () => {
    expect(findRoomMoveConflict({ ...base, targetUnitActive: false })?.kind).toBe("unit_inactive");
  });

  it("allows a back-to-back stay that only touches", () => {
    expect(
      findRoomMoveConflict({
        ...base,
        bookings: [{ id: "b2", unit_id: "u13", state: "confirmed", check_in: "2026-08-20", check_out: "2026-08-25" }],
      })
    ).toBeNull();
  });
});

describe("canMoveBookingRoom", () => {
  it("allows front desk and above", () => {
    expect(canMoveBookingRoom("admin")).toBe(true);
    expect(canMoveBookingRoom("manager")).toBe(true);
    expect(canMoveBookingRoom("front_desk_supervisor")).toBe(true);
    expect(canMoveBookingRoom("front_desk")).toBe(true);
  });

  it("refuses guests, viewers and maintenance", () => {
    expect(canMoveBookingRoom("guest")).toBe(false);
    expect(canMoveBookingRoom("viewer")).toBe(false);
    expect(canMoveBookingRoom("maintenance")).toBe(false);
    expect(canMoveBookingRoom(null)).toBe(false);
  });
});
