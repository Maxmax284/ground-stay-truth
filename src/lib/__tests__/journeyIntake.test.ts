import { describe, it, expect } from "vitest";
import {
  isSamuiArrival,
  needsOnwardTravel,
  onwardPrompt,
  pickFinalLegOrder,
  resolveKnownCodeshare,
  describeLegCarrier,
  mergeLegFields,
  maskBookingReference,
  legsFromExtraction,
  readIntakeStatus,
} from "@/lib/journeyIntake";
import { buildFlightKey } from "@/lib/arrivalIntelligence";

describe("arrival on the island is never assumed", () => {
  it("treats USM as arrival and BKK as not", () => {
    expect(isSamuiArrival("USM")).toBe(true);
    expect(isSamuiArrival("bkk")).toBe(false);
    expect(isSamuiArrival(null)).toBe(false);
  });

  it("asks for the onward hop when the journey ends on the mainland", () => {
    const legs = [
      { leg_order: 1, to_code: "TPE", leg_type: "flight" },
      { leg_order: 2, to_code: "BKK", leg_type: "flight" },
    ];
    expect(needsOnwardTravel(legs)).toBe(true);
    expect(onwardPrompt("Bangkok", "BKK")).toContain("Koh Samui");
  });

  it("stops asking once a leg lands on the island", () => {
    const legs = [
      { leg_order: 1, to_code: "BKK", leg_type: "flight" },
      { leg_order: 2, to_code: "USM", leg_type: "flight" },
    ];
    expect(needsOnwardTravel(legs)).toBe(false);
    expect(pickFinalLegOrder(legs)).toBe(2);
  });

  it("treats a ferry to the island as the operational final leg", () => {
    const legs = [
      { leg_order: 1, to_code: "BKK" },
      { leg_order: 2, to_code: "URT" },
      { leg_order: 3, to_code: "NATHON" },
    ];
    expect(pickFinalLegOrder(legs)).toBe(3);
    expect(needsOnwardTravel(legs.map((l) => ({ ...l, leg_type: "ferry" })))).toBe(false);
  });
});

describe("marketed vs operating carrier", () => {
  it("resolves TG6285 to EVA Air BR3", () => {
    const match = resolveKnownCodeshare("tg 6285");
    expect(match).toEqual({ operatingFlightNumber: "BR3", operatingCarrier: "EVA Air" });
  });

  it("returns null for an unknown number rather than guessing", () => {
    expect(resolveKnownCodeshare("XX9999")).toBeNull();
  });

  it("only mentions the operator when it differs from the ticket", () => {
    expect(
      describeLegCarrier({ marketed_flight_number: "TG6285", operating_flight_number: "BR3", operating_carrier: "EVA Air" }),
    ).toBe("TG6285 · flown by EVA Air as BR3");
    expect(
      describeLegCarrier({ marketed_flight_number: "PG5125", operating_flight_number: "PG5125", operating_carrier: "Bangkok Airways" }),
    ).toBe("PG5125 · Bangkok Airways");
  });

  it("five guests on one aircraft share one flight key", () => {
    const keys = ["TG6285", "BR3", "NH5813", "UA7291", "SQ5031"].map((marketed) =>
      buildFlightKey({
        marketedFlightNumber: marketed,
        operatingFlightNumber: "BR3",
        flightDate: "2026-01-02",
        arrivalCode: "TPE",
      }),
    );
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("BR3:2026-01-02:TPE");
  });
});

describe("safe merge — enrich, never destroy", () => {
  const staffLeg = {
    source: "staff_entered",
    to_code: "USM",
    scheduled_arrival: "2026-01-03T09:00:00Z",
    marketed_flight_number: null,
    from_code: null,
  };

  it("fills blanks from a machine reading", () => {
    const result = mergeLegFields(staffLeg, { marketed_flight_number: "PG5125", from_code: "BKK" }, "evidence_extracted");
    expect(result.updates).toEqual({ marketed_flight_number: "PG5125", from_code: "BKK" });
    expect(result.conflicts).toHaveLength(0);
    expect(result.enriched).toBe(true);
  });

  it("never overwrites a staff-entered arrival airport — raises a critical conflict", () => {
    const result = mergeLegFields(staffLeg, { to_code: "HKT" }, "evidence_extracted");
    expect(result.updates).toEqual({});
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].severity).toBe("critical");
  });

  it("ignores arrival drift under fifteen minutes", () => {
    const result = mergeLegFields(staffLeg, { scheduled_arrival: "2026-01-03T09:10:00Z" }, "provider");
    expect(result.conflicts).toHaveLength(0);
    expect(result.updates).toEqual({});
  });

  it("flags a real time change for a human", () => {
    const result = mergeLegFields(staffLeg, { scheduled_arrival: "2026-01-03T12:00:00Z" }, "provider");
    expect(result.conflicts.map((c) => c.field)).toEqual(["scheduled_arrival"]);
  });

  it("handles a date rollover as a conflict, not a silent edit", () => {
    const result = mergeLegFields(
      { source: "guest_stated", scheduled_arrival: "2026-01-02T23:40:00Z" },
      { scheduled_arrival: "2026-01-03T00:35:00Z" },
      "provider",
    );
    expect(result.conflicts).toHaveLength(1);
    expect(result.updates).toEqual({});
  });
});

describe("booking references are secrets", () => {
  it("masks all but the last three characters", () => {
    expect(maskBookingReference("ABC123")).toBe("•••123");
    expect(maskBookingReference("xy")).toBe("••");
    expect(maskBookingReference(null)).toBeNull();
  });
});

describe("evidence extraction", () => {
  it("builds ordered legs and marks the island arrival as final", () => {
    const legs = legsFromExtraction({
      legs: [
        { leg_type: "flight", flight_number: "TG6285", from_code: "IAD", to_code: "TPE", scheduled_departure: "2026-01-02T18:40:00Z" },
        { leg_type: "flight", flight_number: "BR67", from_code: "TPE", to_code: "BKK", scheduled_departure: "2026-01-03T08:10:00Z" },
        { leg_type: "flight", flight_number: "PG5125", from_code: "BKK", to_code: "USM", scheduled_departure: "2026-01-03T14:00:00Z" },
      ],
      booking_reference: "QWE987",
    });
    expect(legs).toHaveLength(3);
    expect(legs[0].operating_flight_number).toBe("BR3");
    expect(legs[2].is_final_leg).toBe(true);
    expect(legs[0].is_final_leg).toBe(false);
  });

  it("drops rows that carry neither a number nor a route", () => {
    const legs = legsFromExtraction({ legs: [{ leg_type: "flight", carrier: "Some Airline" }] });
    expect(legs).toHaveLength(0);
  });

  it("returns nothing when the reader found nothing", () => {
    expect(legsFromExtraction({})).toHaveLength(0);
  });
});

describe("two-second guest readout", () => {
  it("asks for travel when nothing is on file", () => {
    const status = readIntakeStatus({ legs: [], openConflicts: 0 });
    expect(status.action).toBe("add_travel");
    expect(status.complete).toBe(false);
  });

  it("asks for the onward hop when the journey stops on the mainland", () => {
    const status = readIntakeStatus({
      legs: [{ leg_order: 1, to_code: "BKK", to_name: "Bangkok", leg_type: "flight" }],
      openConflicts: 0,
    });
    expect(status.action).toBe("add_onward");
  });

  it("says there is nothing to do once the island leg is on file", () => {
    const status = readIntakeStatus({
      legs: [{ leg_order: 1, to_code: "USM", to_name: "Samui", leg_type: "flight" }],
      openConflicts: 0,
    });
    expect(status.action).toBeNull();
    expect(status.complete).toBe(true);
  });

  it("surfaces an open conflict as a check, not a failure", () => {
    const status = readIntakeStatus({
      legs: [{ leg_order: 1, to_code: "USM", to_name: "Samui", leg_type: "flight" }],
      openConflicts: 1,
    });
    expect(status.action).toBe("confirm_details");
  });
});
