import { describe, it, expect } from "vitest";
import { buildDriverBrief } from "@/lib/driverBrief";

const base = {
  guestName: "Paul Silverman",
  guestPhone: "+66812345678",
  flightNumber: "PG5125",
  arrivalAirport: "usm",
  arrivalDateTime: "2026-01-03T09:00:00Z",
  meetingPoint: "Main exit, covered driver area",
  driverName: "Somchai",
  licensePlate: "กข 1234",
  passengerCount: 2,
};

describe("driver brief", () => {
  it("carries only what a driver needs", () => {
    const text = buildDriverBrief(base);
    expect(text).toContain("Paul Silverman");
    expect(text).toContain("PG5125");
    expect(text).toContain("USM");
    expect(text).toContain("Main exit");
    expect(text).toContain("Somchai");
    expect(text).toContain("กข 1234");
  });

  it("never leaks money or references", () => {
    const text = buildDriverBrief({ ...base, specialInstructions: "Outstanding balance 31,255 THB, booking ref QWE987" });
    expect(text.toLowerCase()).not.toContain("outstanding");
    expect(text).not.toContain("QWE987");
  });

  it("says a landed plane is not a ready guest", () => {
    expect(buildDriverBrief(base)).toContain("landed plane is not a ready guest");
  });

  it("switches to waiting once the guest says they are ready", () => {
    const text = buildDriverBrief({ ...base, readyAt: "2026-01-03T10:05:00Z" });
    expect(text).toContain("out with bags and waiting");
  });

  it("reports a collected guest", () => {
    expect(buildDriverBrief({ ...base, collectedAt: "2026-01-03T10:20:00Z" })).toContain("already collected");
  });

  it("stays useful with almost no data", () => {
    const text = buildDriverBrief({ guestName: "Guest" });
    expect(text.split("\n")[0]).toBe("Pickup — Guest");
    expect(text).toContain("Status:");
  });

  it("shows Thai time for the arrival", () => {
    expect(buildDriverBrief(base)).toContain("16:00");
  });
});
