import { describe, it, expect } from "vitest";
import {
  AIRPORT_FACTS,
  PIER_FACTS,
  BUS_FACTS,
  ALL_ARRIVAL_LOCATIONS,
  getFactsForLocation,
  getFactValue,
  getTemplatesForAirport,
  getJourneyTemplates,
  getSituationalTemplates,
  SECTION_TEMPLATES,
} from "@/lib/airportFactSheets";

describe("Fact sheets exist and have content", () => {
  it("has BKK and Samui airport facts", () => {
    expect(AIRPORT_FACTS.bkk).toBeDefined();
    expect(AIRPORT_FACTS.bkk.code).toBe("BKK");
    expect(AIRPORT_FACTS.samui).toBeDefined();
    expect(AIRPORT_FACTS.samui.code).toBe("USM");
  });

  it("has Nathon and Lipa Noi pier facts", () => {
    expect(PIER_FACTS.nathon).toBeDefined();
    expect(PIER_FACTS.nathon.name).toBe("Nathon");
    expect(PIER_FACTS.lipa_noi).toBeDefined();
    expect(PIER_FACTS.lipa_noi.name).toBe("Lipa Noi");
  });

  it("has bus facts", () => {
    expect(BUS_FACTS).toBeDefined();
    expect(BUS_FACTS.code).toBe("bus");
    expect(BUS_FACTS.timing.delayCommon).toBe(true);
  });

  it("pier facts have transport options to camp", () => {
    expect(PIER_FACTS.nathon.transport.toCamp.length).toBeGreaterThan(0);
    expect(PIER_FACTS.lipa_noi.transport.toCamp.length).toBeGreaterThan(0);
  });

  it("pier facts have ferry timing info", () => {
    expect(PIER_FACTS.nathon.timing.firstFerry).toBeTruthy();
    expect(PIER_FACTS.nathon.timing.lastFerry).toBeTruthy();
  });
});

describe("getFactsForLocation", () => {
  it("returns airport facts for bkk/samui", () => {
    expect(getFactsForLocation("bkk")).toBe(AIRPORT_FACTS.bkk);
    expect(getFactsForLocation("samui")).toBe(AIRPORT_FACTS.samui);
  });

  it("returns pier facts for nathon/lipa_noi", () => {
    expect(getFactsForLocation("nathon")).toBe(PIER_FACTS.nathon);
    expect(getFactsForLocation("lipa_noi")).toBe(PIER_FACTS.lipa_noi);
  });

  it("returns bus facts for bus", () => {
    expect(getFactsForLocation("bus")).toBe(BUS_FACTS);
  });

  it("returns null for unknown location", () => {
    expect(getFactsForLocation("mars")).toBeNull();
  });
});

describe("getFactValue", () => {
  it("resolves dot-path for airport facts", () => {
    const val = getFactValue(AIRPORT_FACTS.bkk, "immigration.estimatedTime");
    expect(val).toBeTruthy();
    expect(typeof val).toBe("string");
  });

  it("resolves dot-path for pier facts", () => {
    const val = getFactValue(PIER_FACTS.nathon, "arrival.estimatedDisembarkTime");
    expect(val).toBeTruthy();
  });

  it("returns undefined for invalid path", () => {
    expect(getFactValue(AIRPORT_FACTS.bkk, "nonexistent.path")).toBeUndefined();
  });
});

describe("ALL_ARRIVAL_LOCATIONS", () => {
  it("has 5 locations (2 airports, 2 piers, 1 bus)", () => {
    expect(ALL_ARRIVAL_LOCATIONS).toHaveLength(5);
  });

  it("includes all expected IDs", () => {
    const ids = ALL_ARRIVAL_LOCATIONS.map(l => l.id);
    expect(ids).toContain("bkk");
    expect(ids).toContain("samui");
    expect(ids).toContain("nathon");
    expect(ids).toContain("lipa_noi");
    expect(ids).toContain("bus");
  });
});

describe("Section templates", () => {
  it("has pier-specific templates", () => {
    const pierTemplates = getTemplatesForAirport("nathon");
    expect(pierTemplates.length).toBeGreaterThan(0);
    const ids = pierTemplates.map(t => t.id);
    expect(ids).toContain("pier_arrival");
    expect(ids).toContain("pier_facilities");
  });

  it("has bus-specific templates", () => {
    const busTemplates = getTemplatesForAirport("bus");
    expect(busTemplates.length).toBeGreaterThan(0);
    const ids = busTemplates.map(t => t.id);
    expect(ids).toContain("bus_arrival");
    expect(ids).toContain("bus_timing");
  });

  it("pier templates do NOT include airport-only sections like immigration", () => {
    const pierTemplates = getTemplatesForAirport("nathon");
    const ids = pierTemplates.map(t => t.id);
    expect(ids).not.toContain("immigration");
    expect(ids).not.toContain("terminal_navigation");
  });

  it("custom section is available for all locations", () => {
    for (const loc of ALL_ARRIVAL_LOCATIONS) {
      const templates = getTemplatesForAirport(loc.id);
      const ids = templates.map(t => t.id);
      expect(ids).toContain("custom");
    }
  });

  it("first_time_thailand is available for all locations", () => {
    for (const loc of ALL_ARRIVAL_LOCATIONS) {
      const templates = getSituationalTemplates(loc.id);
      const ids = templates.map(t => t.id);
      expect(ids).toContain("first_time_thailand");
    }
  });

  it("journey vs situational categorization is correct for pier", () => {
    const journey = getJourneyTemplates("nathon");
    const situational = getSituationalTemplates("nathon");
    
    expect(journey.map(t => t.id)).toContain("pier_arrival");
    expect(situational.map(t => t.id)).toContain("ferry_timing");
  });
});
