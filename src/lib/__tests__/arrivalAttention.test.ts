import { describe, it, expect } from "vitest";
import {
  detectArrivalAttention,
  buildArrivalSituation,
  buildFlightKey,
  type JourneyLeg,
  type FlightFact,
  type AttentionCode,
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
    source: "staff_entered",
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

const base = {
  legs: [] as JourneyLeg[],
  finalLeg: null as JourneyLeg | null,
  finalFact: null as FlightFact | null,
  aircraft: { status: "scheduled" as const, delayMinutes: 0 },
  guestStep: "details_confirmed" as const,
  connections: [],
  dataIsStale: false,
  openConflicts: 0,
  pickupRequested: false,
  driverAssigned: false,
};

const codes = (checks: { code: AttentionCode }[]) => checks.map((c) => c.code);

describe("attention checks — nothing here changes anything", () => {
  it("says plainly when there are no travel details", () => {
    expect(codes(detectArrivalAttention(base))).toContain("no_travel_details");
  });

  it("flags a journey that stops on the mainland with no island leg", () => {
    const l = leg({ leg_order: 1, to_code: "BKK", is_final_leg: true });
    const out = detectArrivalAttention({ ...base, legs: [l], finalLeg: l });
    expect(codes(out)).toContain("missing_island_leg");
  });

  it("does not complain when the last leg lands on Samui", () => {
    const l = leg({ leg_order: 1, to_code: "USM", is_final_leg: true });
    const out = detectArrivalAttention({ ...base, legs: [l], finalLeg: l });
    expect(codes(out)).not.toContain("missing_island_leg");
  });

  it("catches a pickup set for the wrong airport", () => {
    const l = leg({ leg_order: 1, to_code: "USM", is_final_leg: true });
    const out = detectArrivalAttention({ ...base, legs: [l], finalLeg: l, pickupAirportCode: "BKK" });
    const mismatch = out.find((c) => c.code === "final_airport_mismatch");
    expect(mismatch?.severity).toBe("critical");
  });

  it("landed aircraft with no guest-ready is stated, never assumed ready", () => {
    const l = leg({ leg_order: 1, to_code: "USM", is_final_leg: true });
    const out = detectArrivalAttention({
      ...base,
      legs: [l],
      finalLeg: l,
      aircraft: { status: "landed", delayMinutes: 0 },
      guestStep: "travelling",
    });
    const check = out.find((c) => c.code === "landed_not_ready");
    expect(check).toBeTruthy();
    expect(check?.action).toBeNull();
  });

  it("drops the landed check once a human confirmed the guest is ready", () => {
    const l = leg({ leg_order: 1, to_code: "USM", is_final_leg: true });
    const out = detectArrivalAttention({
      ...base,
      legs: [l],
      finalLeg: l,
      aircraft: { status: "landed", delayMinutes: 0 },
      guestStep: "ready_for_pickup",
      guestReadyAt: "2026-10-01T09:00:00Z",
    });
    expect(codes(out)).not.toContain("landed_not_ready");
  });

  it("flags a pickup with no arrival time anyone can drive to", () => {
    const l = leg({ leg_order: 1, to_code: "USM", is_final_leg: true });
    const out = detectArrivalAttention({ ...base, legs: [l], finalLeg: l, pickupRequested: true });
    expect(codes(out)).toEqual(expect.arrayContaining(["pickup_no_arrival_time", "pickup_no_driver"]));
  });

  it("accepts a provider estimate as an actionable arrival time", () => {
    const l = leg({ leg_order: 1, to_code: "USM", is_final_leg: true, flight_fact_id: "f1" });
    const f = fact({ estimated_arrival: "2026-10-01T12:30:00Z" });
    const out = detectArrivalAttention({
      ...base,
      legs: [l],
      finalLeg: l,
      finalFact: f,
      pickupRequested: true,
      driverAssigned: true,
    });
    expect(codes(out)).not.toContain("pickup_no_arrival_time");
  });

  it("says stale data is stale rather than pretending it is current", () => {
    const l = leg({ leg_order: 1, to_code: "USM", is_final_leg: true });
    expect(codes(detectArrivalAttention({ ...base, legs: [l], finalLeg: l, dataIsStale: true }))).toContain("stale_flight_data");
  });

  it("turns provider-vs-staff disagreement into a human question", () => {
    const l = leg({ leg_order: 1, to_code: "USM", is_final_leg: true });
    const out = detectArrivalAttention({ ...base, legs: [l], finalLeg: l, openConflicts: 2 });
    const check = out.find((c) => c.code === "details_to_confirm");
    expect(check?.action).toBe("Confirm details");
    expect(check?.message).toContain("2 travel details");
  });

  it("calls a cancelled flight out and states nothing changed automatically", () => {
    const l = leg({ leg_order: 1, to_code: "USM", is_final_leg: true });
    const out = detectArrivalAttention({
      ...base,
      legs: [l],
      finalLeg: l,
      aircraft: { status: "cancelled", delayMinutes: 0 },
    });
    expect(out.find((c) => c.code === "flight_disrupted")?.message).toMatch(/Nothing was changed automatically/);
  });
});

describe("attention rides along with the situation read-model", () => {
  it("buildArrivalSituation exposes the same checks", () => {
    const l = leg({ leg_order: 1, to_code: "USM", is_final_leg: true });
    const s = buildArrivalSituation({
      legs: [l],
      facts: {},
      progress: { guestLandedAt: null, guestReadyAt: null, collectedAt: null, checkedIn: false },
      openConflicts: 1,
      driverAssigned: false,
      pickupRequested: true,
      pickupAirportCode: "BKK",
    });
    expect(codes(s.attention)).toEqual(
      expect.arrayContaining(["final_airport_mismatch", "pickup_no_arrival_time", "pickup_no_driver", "details_to_confirm"]),
    );
  });

  it("five guests on the same aircraft share one flight fact key", () => {
    const keys = ["TG6285", "BR3", "NZ4053", "SQ5203", "UA7799"].map((n) =>
      buildFlightKey({ operatingFlightNumber: "BR3", marketedFlightNumber: n, flightDate: "2026-10-01", arrivalCode: "TPE" }),
    );
    expect(new Set(keys).size).toBe(1);
  });
});
