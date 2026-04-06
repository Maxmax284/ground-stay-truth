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
  it("normalizes a flight arrival with all fields", () => {
    const result = normalizeArrival({
      arrival_type: "flight",
      arrival_location_type: "airport",
      arrival_location_name: "Samui Airport (USM)",
      arrival_datetime: "2026-04-10T14:00:00Z",
      arrival_confidence: "high",
      transport_intent: "pickup",
      pickup_enabled: true,
      status: "requested",
    });

    expect(result.arrivalType).toBe("flight");
    expect(result.locationType).toBe("airport");
    expect(result.confidence).toBe("high");
    expect(result.pickupResolution).toBe("pickup_scheduled");
    expect(result.requiresStaffAction).toBe(true);
  });

  it("normalizes a ferry arrival with defaults", () => {
    const result = normalizeArrival({
      arrival_type: "ferry",
      transport_intent: "pickup",
      pickup_enabled: true,
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

  it("completed status means no staff action even with pickup scheduled", () => {
    const result = normalizeArrival({
      arrival_type: "flight",
      transport_intent: "pickup",
      pickup_enabled: true,
      status: "completed",
    });

    expect(result.pickupResolution).toBe("pickup_scheduled");
    expect(result.requiresStaffAction).toBe(false);
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
