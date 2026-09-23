import { describe, it, expect } from "vitest";
import {
  resolveAirportGuidance,
  normalizeAirportCode,
  isGuidanceStale,
  curatedAirportCodes,
  CURATED_AIRPORTS,
} from "@/lib/airportGuidance";

describe("airportGuidance", () => {
  it("covers both ends of the Lamai journey", () => {
    expect(curatedAirportCodes()).toContain("BKK");
    expect(curatedAirportCodes()).toContain("USM");
  });

  it("returns curated guidance for a known airport", () => {
    const r = resolveAirportGuidance("bkk");
    expect(r?.kind).toBe("curated");
    if (r?.kind === "curated") expect(r.airport.timezone).toBe("Asia/Bangkok");
  });

  it("says plainly when an airport isn't covered instead of inventing one", () => {
    const r = resolveAirportGuidance("XYZ");
    expect(r).toEqual({ kind: "unknown", code: "XYZ" });
  });

  it("ignores junk codes", () => {
    expect(normalizeAirportCode("")).toBeNull();
    expect(normalizeAirportCode("Bangkok")).toBeNull();
    expect(resolveAirportGuidance(null)).toBeNull();
  });

  it("only ever links official airport or government sources", () => {
    const allowed = /^https:\/\/[a-z0-9.-]+\.(com|net|org|nl|jp|kr|fr|th|au|my|ae|do)|^https:\/\/[a-z0-9.-]+\.(go\.th|airportthai\.co\.th|immigration\.go\.th|com\.my|co\.th)/;
    for (const a of Object.values(CURATED_AIRPORTS)) {
      expect(a.links.length).toBeGreaterThan(0);
      for (const l of a.links) {
        expect(l.url.startsWith("https://"), `${a.code}: ${l.url}`).toBe(true);
        expect(l.url).toMatch(allowed);
      }
    }
  });

  it("never ships a gate number or visa advice in the orientation copy", () => {
    const banned = /\bgate\s*\d|\bcheck-?in desk\s*\d|\bvisa\b/i;
    for (const a of Object.values(CURATED_AIRPORTS)) {
      expect(a.orientation, a.code).not.toMatch(banned);
      expect(a.terminals ?? "", a.code).not.toMatch(banned);
    }
  });

  it("every entry carries a review date", () => {
    for (const a of Object.values(CURATED_AIRPORTS)) {
      expect(a.lastReviewed, a.code).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("flags an entry nobody has checked in six months", () => {
    const bkk = CURATED_AIRPORTS.BKK;
    expect(isGuidanceStale(bkk, new Date(`${bkk.lastReviewed}T00:00:00Z`))).toBe(false);
    expect(isGuidanceStale(bkk, new Date("2030-01-01T00:00:00Z"))).toBe(true);
  });
});
