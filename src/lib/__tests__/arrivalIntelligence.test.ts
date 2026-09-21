import { describe, it, expect } from "vitest";
import {
  buildFlightKey,
  describeCarrier,
  canOverwrite,
  detectConflicts,
  assessConnections,
  readAircraftStatus,
  readGuestStep,
  buildArrivalSituation,
  type JourneyLeg,
  type FlightFact,
} from "@/lib/arrivalIntelligence";

function leg(partial: Partial<JourneyLeg> & { leg_order: number }): JourneyLeg {
  return {
    id: `leg-${partial.leg_order}`,
    booking_id: "b1",
    leg_type: "flight",
    marketed_flight_number: null,
    operating_flight_number: null,
    operating_carrier: null,
    from_code: null,
    to_code: null,
    from_name: null,
    to_name: null,
    departure_timezone: null,
    arrival_timezone: null,
    scheduled_departure: null,
    scheduled_arrival: null,
    leg_status: "unknown",
    is_final_leg: false,
    source: "guest_stated",
    confidence: "high",
    flight_fact_id: null,
    ...partial,
  } as JourneyLeg;
}

function fact(partial: Partial<FlightFact>): FlightFact {
  return {
    flight_key: "X",
    flight_date: "2026-10-01",
    marketed_flight_number: null,
    operating_flight_number: null,
    marketed_carrier: null,
    operating_carrier: null,
    airline_name: null,
    departure_iata: null,
    arrival_iata: null,
    departure_timezone: null,
    arrival_timezone: null,
    scheduled_departure: null,
    scheduled_arrival: null,
    estimated_arrival: null,
    actual_arrival: null,
    flight_status: "scheduled",
    delay_minutes: 0,
    ...partial,
  };
}

describe("codeshare: TG6285 marketed, BR3 operated", () => {
  const codeshare = fact({
    marketed_flight_number: "TG6285",
    operating_flight_number: "BR3",
    operating_carrier: "EVA Air",
    departure_iata: "IAD",
    arrival_iata: "TPE",
  });

  it("keys the shared fact on the operating flight so guests converge", () => {
    const key = buildFlightKey({
      marketedFlightNumber: "TG 6285",
      operatingFlightNumber: "br3",
      flightDate: "2026-10-01",
      arrivalCode: "tpe",
    });
    expect(key).toBe("BR3:2026-10-01:TPE");
  });

  it("five guests on five codeshare numbers share one key", () => {
    const marketedNumbers = ["TG6285", "BR3", "NH5812", "UA7854", "SQ5001"];
    const keys = new Set(
      marketedNumbers.map((m) =>
        buildFlightKey({ marketedFlightNumber: m, operatingFlightNumber: "BR3", flightDate: "2026-10-01", arrivalCode: "TPE" }),
      ),
    );
    expect(keys.size).toBe(1);
  });

  it("explains the carrier in plain language, no jargon", () => {
    expect(describeCarrier(codeshare)).toBe("TG6285 — flown by EVA Air as BR3");
    expect(describeCarrier(fact({ marketed_flight_number: "PG5125", operating_flight_number: "PG5125", airline_name: "Bangkok Airways" })))
      .toBe("PG5125 — Bangkok Airways");
    expect(describeCarrier(fact({}))).toBe("Flight not on file");
  });
});

describe("source hierarchy", () => {
  it("never lets the provider silently beat a person", () => {
    expect(canOverwrite("staff_entered", "provider")).toBe(false);
    expect(canOverwrite("guest_stated", "provider")).toBe(false);
    expect(canOverwrite("inferred", "provider")).toBe(true);
    expect(canOverwrite(null, "provider")).toBe(true);
  });

  it("flags machine-vs-human disagreement as a question", () => {
    const conflicts = detectConflicts(
      { to_code: "USM", scheduled_arrival: "2026-10-02T10:00:00Z" },
      "staff_entered",
      { to_code: "URT", scheduled_arrival: "2026-10-02T10:05:00Z" },
      "provider",
      ["to_code", "scheduled_arrival"],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].fieldName).toBe("to_code");
    expect(conflicts[0].severity).toBe("critical");
  });

  it("ignores trivial time drift but catches a real change", () => {
    expect(detectConflicts({ scheduled_arrival: "2026-10-02T10:00:00Z" }, "provider", { scheduled_arrival: "2026-10-02T10:10:00Z" }, "provider", ["scheduled_arrival"])).toHaveLength(0);
    expect(detectConflicts({ scheduled_arrival: "2026-10-02T10:00:00Z" }, "provider", { scheduled_arrival: "2026-10-02T14:00:00Z" }, "provider", ["scheduled_arrival"])).toHaveLength(1);
  });
});

describe("multi-leg journeys, timezones and rollovers", () => {
  const legs = [
    leg({ leg_order: 1, marketed_flight_number: "TG6285", operating_flight_number: "BR3", from_code: "IAD", to_code: "TPE", departure_timezone: "America/New_York", arrival_timezone: "Asia/Taipei", scheduled_departure: "2026-10-01T01:00:00Z", scheduled_arrival: "2026-10-02T06:00:00Z", flight_fact_id: "f1" }),
    leg({ leg_order: 2, from_code: "TPE", to_code: "BKK", scheduled_departure: "2026-10-02T09:00:00Z", scheduled_arrival: "2026-10-02T12:30:00Z" }),
    leg({ leg_order: 3, from_code: "BKK", to_code: "USM", to_name: "Samui Airport (USM)", scheduled_departure: "2026-10-02T15:00:00Z", scheduled_arrival: "2026-10-02T16:15:00Z", is_final_leg: true, flight_fact_id: "f3" }),
  ];

  it("survives a date rollover across zones", () => {
    const risks = assessConnections(legs, { f1: fact({ scheduled_arrival: "2026-10-02T06:00:00Z" }) });
    expect(risks[0].level).toBe("comfortable");
    expect(risks[0].minutesBetween).toBe(180);
  });

  it("calls a broken onward connection what it is", () => {
    const broken = [legs[0], leg({ leg_order: 2, from_code: "TPE", to_code: "BKK", scheduled_departure: "2026-10-02T05:00:00Z" })];
    const risks = assessConnections(broken, { f1: fact({ estimated_arrival: "2026-10-02T06:00:00Z" }) });
    expect(risks[0].level).toBe("broken");
  });

  it("treats a ferry handoff as needing more slack", () => {
    const ferry = [
      leg({ leg_order: 1, to_code: "URT", scheduled_arrival: "2026-10-02T10:00:00Z", flight_fact_id: "f1" }),
      leg({ leg_order: 2, leg_type: "ferry", from_code: "URT", to_name: "Nathon Pier", scheduled_departure: "2026-10-02T11:30:00Z", is_final_leg: true }),
    ];
    const risks = assessConnections(ferry, { f1: fact({ scheduled_arrival: "2026-10-02T10:00:00Z" }) });
    expect(risks[0].level).toBe("tight");
  });

  it("returns unknown instead of guessing when times are missing", () => {
    const risks = assessConnections([leg({ leg_order: 1 }), leg({ leg_order: 2 })]);
    expect(risks[0].level).toBe("unknown");
  });
});

describe("aircraft landed is never guest ready", () => {
  it("keeps the guest on the travelling step when the plane lands", () => {
    const step = readGuestStep({ finalLegConfirmed: true, hasAnyLeg: true });
    expect(step).toBe("travelling");
  });

  it("only a human action advances the ladder", () => {
    expect(readGuestStep({ hasAnyLeg: true, finalLegConfirmed: true, guestLandedAt: "2026-10-02T16:20:00Z" })).toBe("self_reported_landed");
    expect(readGuestStep({ hasAnyLeg: true, guestLandedAt: "x", guestReadyAt: "y" })).toBe("ready_for_pickup");
    expect(readGuestStep({ hasAnyLeg: true, collectedAt: "z" })).toBe("collected");
    expect(readGuestStep({ hasAnyLeg: true, checkedIn: true })).toBe("checked_in");
    expect(readGuestStep({})).toBe("details_needed");
  });

  it("reads delay as delayed, not as landed", () => {
    expect(readAircraftStatus(fact({ flight_status: "scheduled", delay_minutes: 45 })).status).toBe("delayed");
    expect(readAircraftStatus(fact({ flight_status: "active" })).status).toBe("in_air");
    expect(readAircraftStatus(null).status).toBe("unknown");
  });

  it("guest view after landing asks for a deliberate I'm ready", () => {
    const s = buildArrivalSituation({
      legs: [leg({ leg_order: 1, is_final_leg: true, to_name: "Samui Airport (USM)", flight_fact_id: "f" })],
      facts: { f: fact({ flight_status: "landed", last_checked_at: new Date().toISOString() }) },
      progress: {},
      openConflicts: 0,
      driverAssigned: true,
      driverName: "Nok",
      driverPlate: "8กข 1234",
      pickupRequested: true,
      factLastCheckedAt: new Date().toISOString(),
    });
    expect(s.aircraft.status).toBe("landed");
    expect(s.guestStep).toBe("travelling");
    expect(s.views.guest.action).toBe("I'm ready");
    expect(s.views.driver.action).toBeNull();
  });
});

describe("role views and exceptions", () => {
  const base = {
    legs: [leg({ leg_order: 1, is_final_leg: true, to_name: "Samui Airport (USM)", flight_fact_id: "f" })],
    facts: { f: fact({ flight_status: "scheduled", last_checked_at: new Date().toISOString() }) },
    progress: {},
    openConflicts: 0,
    driverAssigned: true,
    pickupRequested: true,
    factLastCheckedAt: new Date().toISOString(),
  };

  it("late pickup with no driver becomes an exception and an assign action", () => {
    const s = buildArrivalSituation({ ...base, driverAssigned: false, progress: { guestLandedAt: "2026-10-02T16:20:00Z" } });
    expect(s.exceptions).toContain("Pickup requested, no driver assigned.");
    expect(s.views.front_desk.action).toBe("Assign pickup");
    expect(s.views.manager.severity).toBe("warning");
  });

  it("no data at all asks the guest for details and nobody else", () => {
    const s = buildArrivalSituation({ ...base, legs: [], facts: {} });
    expect(s.views.guest.action).toBe("Confirm details");
    expect(s.exceptions).toContain("No travel details on file.");
  });

  it("changed flight and conflicts surface as details to confirm", () => {
    const s = buildArrivalSituation({ ...base, openConflicts: 2 });
    expect(s.exceptions).toContain("2 details to confirm.");
    expect(s.views.admin.action).toBe("Confirm details");
  });

  it("stale provider data is stated honestly, not hidden", () => {
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const s = buildArrivalSituation({ ...base, facts: { f: fact({ last_checked_at: old }) }, factLastCheckedAt: old });
    expect(s.dataIsStale).toBe(true);
    expect(s.views.admin.detail).toContain("data stale");
  });

  it("driver view never carries money, other guests or provenance", () => {
    const s = buildArrivalSituation({ ...base, meetingPoint: "Main exit, arrivals hall", progress: { guestLandedAt: "a", guestReadyAt: "b" } });
    const blob = JSON.stringify(s.views.driver).toLowerCase();
    expect(blob).not.toMatch(/fee|price|balance|฿|source|conflict/);
    expect(s.views.driver.action).toBe("Collected");
  });

  it("a no-show style passed arrival with nothing confirmed stays a human decision", () => {
    const s = buildArrivalSituation({ ...base, driverAssigned: false, progress: {} });
    expect(s.views.front_desk.action).toBe("Assign pickup");
    expect(s.guestStep).toBe("travelling");
  });
});
