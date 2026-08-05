import { describe, it, expect } from "vitest";
import {
  resolvePickupStatus,
  normalizeArrival,
  getDefaultLocation,
  getLocationByName,
  SAMUI_LOCATIONS,
  ARRIVAL_TYPE_CONFIG,
} from "@/lib/arrivalModel";

describe("resolvePickupStatus", () => {
  it("returns pickup_disabled when admin disables pickup regardless of guest intent", () => {
    expect(resolvePickupStatus("pickup", false)).toBe("pickup_disabled");
    expect(resolvePickupStatus("self_arrival", false)).toBe("pickup_disabled");
  });

  it("returns self_arrival when guest chooses self_arrival and pickup is enabled", () => {
    expect(resolvePickupStatus("self_arrival", true)).toBe("self_arrival");
  });

  it("returns pickup_scheduled when guest wants pickup and admin enables it", () => {
    expect(resolvePickupStatus("pickup", true)).toBe("pickup_scheduled");
  });
});

describe("normalizeArrival", () => {
  it("a bare guest request is Requested, not Scheduled", () => {
    const result = normalizeArrival({
      arrival_type: "flight",
      arrival_location_type: "airport",
      arrival_location_name: "Samui Airport (USM)",
      arrival_datetime: "2026-04-10T14:00:00Z",
      arrival_confidence: "high",
      transport_intent: "pickup",
      pickup_enabled: true,
      status: "requested",
      driver_id: null,
    });

    expect(result.arrivalType).toBe("flight");
    expect(result.locationType).toBe("airport");
    expect(result.confidence).toBe("high");
    expect(result.driverAssigned).toBe(false);
    expect(result.pickupResolution).toBe("pickup_requested");
    expect(result.requiresStaffAction).toBe(true);
  });

  it("driver assigned + arrival time + confirmation is Scheduled", () => {
    const result = normalizeArrival({
      arrival_type: "flight",
      arrival_datetime: "2026-04-10T14:00:00Z",
      transport_intent: "pickup",
      pickup_enabled: true,
      status: "assigned",
      driver_id: "d1",
    });

    expect(result.driverAssigned).toBe(true);
    expect(result.pickupResolution).toBe("pickup_scheduled");
  });

  it("normalizes a ferry arrival with defaults", () => {
    const result = normalizeArrival({
      arrival_type: "ferry",
      transport_intent: "pickup",
      pickup_enabled: true,
      status: "confirmed",
    });

    expect(result.arrivalType).toBe("ferry");
    expect(result.locationType).toBe("pier");
    expect(result.confidence).toBe("flexible");
    expect(result.pickupResolution).toBe("pickup_scheduled");
  });

  it("normalizes a bus arrival with flexible confidence", () => {
    const result = normalizeArrival({
      arrival_type: "bus",
      transport_intent: "self_arrival",
      pickup_enabled: true,
    });

    expect(result.arrivalType).toBe("bus");
    expect(result.locationType).toBe("other");
    expect(result.confidence).toBe("flexible");
    expect(result.pickupResolution).toBe("self_arrival");
    expect(result.requiresStaffAction).toBe(false);
  });

  it("defaults to flight when arrival_type is invalid", () => {
    const result = normalizeArrival({ arrival_type: "teleportation" });
    expect(result.arrivalType).toBe("flight");
  });

  it("admin override wins even for pickup intent", () => {
    const result = normalizeArrival({
      arrival_type: "ferry",
      transport_intent: "pickup",
      pickup_enabled: false,
    });

    expect(result.pickupResolution).toBe("pickup_disabled");
    expect(result.requiresStaffAction).toBe(false);
  });

  it("completed status means no staff action", () => {
    const result = normalizeArrival({
      arrival_type: "flight",
      transport_intent: "pickup",
      pickup_enabled: true,
      status: "completed",
    });

    expect(result.pickupResolution).toBe("pickup_completed");
    expect(result.requiresStaffAction).toBe(false);
  });

  it("failed pickup is surfaced as not completed", () => {
    const result = normalizeArrival({
      arrival_type: "flight",
      transport_intent: "pickup",
      pickup_enabled: true,
      status: "failed",
    });

    expect(result.pickupResolution).toBe("pickup_failed");
    expect(result.requiresStaffAction).toBe(false);
  });
});

describe("getPickupWarnings", () => {
  const base = {
    arrival_type: "flight",
    transport_intent: "pickup",
    pickup_enabled: true,
    status: "requested",
    driver_id: null as string | null,
  };

  it("warns when no driver is assigned far out", () => {
    const now = new Date("2026-08-01T00:00:00Z");
    const w = getPickupWarnings(
      normalizeArrival({ ...base, arrival_datetime: "2026-08-05T07:45:00Z" }),
      { now },
    );
    expect(w.some((x) => x.message.includes("no driver assigned"))).toBe(true);
    expect(w.every((x) => x.severity === "warning")).toBe(true);
  });

  it("escalates to critical within 3 hours", () => {
    const now = new Date("2026-08-05T06:00:00Z");
    const w = getPickupWarnings(
      normalizeArrival({ ...base, arrival_datetime: "2026-08-05T07:45:00Z" }),
      { now },
    );
    expect(w.some((x) => x.severity === "critical")).toBe(true);
  });

  it("flags a passed arrival for reconciliation", () => {
    const now = new Date("2026-08-05T12:00:00Z");
    const w = getPickupWarnings(
      normalizeArrival({ ...base, arrival_datetime: "2026-08-05T07:45:00Z" }),
      { now },
    );
    expect(w.some((x) => x.message.includes("Arrival time has passed"))).toBe(true);
  });

  it("stays quiet for self arrival", () => {
    const w = getPickupWarnings(
      normalizeArrival({ ...base, transport_intent: "self_arrival" }),
    );
    expect(w).toHaveLength(0);
  });
});

describe("camp timezone formatting", () => {
  it("renders 07:45 UTC as 2:45 PM Thailand time", () => {
    expect(formatCampLabeled("2026-08-05T07:45:00Z")).toBe("Aug 5, 2:45 PM Thailand time");
    expect(formatCampTime("2026-08-05T07:45:00Z")).toBe("2:45 PM");
  });
});

describe("getDefaultLocation", () => {
  it("returns USM airport for flight", () => {
    const loc = getDefaultLocation("flight");
    expect(loc.shortName).toBe("USM");
    expect(loc.type).toBe("airport");
  });

  it("returns Nathon Pier for ferry", () => {
    const loc = getDefaultLocation("ferry");
    expect(loc.shortName).toBe("Nathon");
    expect(loc.type).toBe("pier");
  });

  it("returns fallback for unknown type", () => {
    const loc = getDefaultLocation("unknown");
    expect(loc).toBeDefined();
  });
});

describe("getLocationByName", () => {
  it("finds location by full name", () => {
    const loc = getLocationByName("Nathon Pier");
    expect(loc).not.toBeNull();
    expect(loc!.shortName).toBe("Nathon");
  });

  it("finds location by short name (case-insensitive)", () => {
    const loc = getLocationByName("nathon");
    expect(loc).not.toBeNull();
  });

  it("returns null for unknown name", () => {
    expect(getLocationByName("Mars Spaceport")).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(getLocationByName(null)).toBeNull();
    expect(getLocationByName(undefined)).toBeNull();
  });
});

describe("ARRIVAL_TYPE_CONFIG", () => {
  it("has config for all arrival types", () => {
    expect(ARRIVAL_TYPE_CONFIG.flight).toBeDefined();
    expect(ARRIVAL_TYPE_CONFIG.ferry).toBeDefined();
    expect(ARRIVAL_TYPE_CONFIG.bus).toBeDefined();
    expect(ARRIVAL_TYPE_CONFIG.hybrid).toBeDefined();
    expect(ARRIVAL_TYPE_CONFIG.unknown).toBeDefined();
  });

  it("ferry has flexible confidence by default", () => {
    expect(ARRIVAL_TYPE_CONFIG.ferry.defaultConfidence).toBe("flexible");
    expect(ARRIVAL_TYPE_CONFIG.ferry.precisionExpected).toBe(false);
  });

  it("flight has high confidence by default", () => {
    expect(ARRIVAL_TYPE_CONFIG.flight.defaultConfidence).toBe("high");
    expect(ARRIVAL_TYPE_CONFIG.flight.precisionExpected).toBe(true);
  });
});
