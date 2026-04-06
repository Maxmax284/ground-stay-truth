import { describe, it, expect } from "vitest";
import {
  arrivalLocationLabel,
  airportLabel,
  resolveArrivalGuideKey,
} from "@/components/ArrivalWelcomeGuide";

describe("arrivalLocationLabel", () => {
  it("returns correct labels for all known locations", () => {
    expect(arrivalLocationLabel("bkk")).toBe("BKK (Suvarnabhumi)");
    expect(arrivalLocationLabel("samui")).toBe("USM (Koh Samui)");
    expect(arrivalLocationLabel("nathon")).toBe("Nathon Pier");
    expect(arrivalLocationLabel("lipa_noi")).toBe("Lipa Noi Pier");
    expect(arrivalLocationLabel("bus")).toBe("Bus / Van Arrival");
  });

  it("returns 'Unknown' for null", () => {
    expect(arrivalLocationLabel(null)).toBe("Unknown");
  });

  it("returns the code itself for unknown locations", () => {
    expect(arrivalLocationLabel("mars")).toBe("mars");
  });
});

describe("airportLabel (legacy)", () => {
  it("still works for bkk/samui", () => {
    expect(airportLabel("bkk")).toBe("BKK (Suvarnabhumi)");
    expect(airportLabel("samui")).toBe("USM (Koh Samui)");
  });

  it("handles null", () => {
    expect(airportLabel(null)).toBe("Unknown");
  });
});

describe("resolveArrivalGuideKey", () => {
  it("uses arrivalLocationId when provided", () => {
    expect(resolveArrivalGuideKey("bkk", "nathon")).toBe("arrival_welcome_nathon");
    expect(resolveArrivalGuideKey(null, "bus")).toBe("arrival_welcome_bus");
  });

  it("falls back to airport when no arrivalLocationId", () => {
    expect(resolveArrivalGuideKey("bkk", null)).toBe("arrival_welcome_bkk");
    expect(resolveArrivalGuideKey("samui", undefined)).toBe("arrival_welcome_samui");
  });

  it("returns null when nothing provided", () => {
    expect(resolveArrivalGuideKey(null, null)).toBeNull();
    expect(resolveArrivalGuideKey(null, undefined)).toBeNull();
  });

  it("arrivalLocationId always takes priority over airport", () => {
    // Even if airport says "bkk", if location says "lipa_noi", pier wins
    expect(resolveArrivalGuideKey("bkk", "lipa_noi")).toBe("arrival_welcome_lipa_noi");
  });
});
