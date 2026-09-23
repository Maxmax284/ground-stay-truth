import { describe, it, expect } from "vitest";
import { resolveJourneyStage, STAGE_THEMES, type JourneyStage } from "@/lib/guestJourneyStage";

describe("resolveJourneyStage", () => {
  it("stays plain with no booking", () => {
    expect(resolveJourneyStage({ nowState: "none", journeyPhase: undefined })).toBeNull();
  });

  it("checked in wins over everything", () => {
    expect(resolveJourneyStage({ nowState: "onsite", journeyPhase: "arrival" })).toBe("in_house");
    expect(resolveJourneyStage({ nowState: "quiet", journeyPhase: "stay" })).toBe("in_house");
    expect(resolveJourneyStage({ nowState: "quiet", journeyPhase: "departure" })).toBe("in_house");
  });

  it("confirmed Bangkok ground stop shows the connection stage", () => {
    expect(resolveJourneyStage({ nowState: "flight", journeyPhase: "transit" })).toBe("bangkok");
  });

  it("arrival day splits on whether a pickup exists", () => {
    expect(resolveJourneyStage({ nowState: "flight", journeyPhase: "arrival" })).toBe("island_approach");
    expect(
      resolveJourneyStage({ nowState: "flight", journeyPhase: "arrival", awaitingPickup: true }),
    ).toBe("pickup");
  });

  it("travelling soon is transit, everything else is preparing", () => {
    expect(resolveJourneyStage({ nowState: "flight", journeyPhase: "pre_arrival" })).toBe("transit");
    expect(resolveJourneyStage({ nowState: "deposit", journeyPhase: "pre_arrival" })).toBe("preparing");
    expect(resolveJourneyStage({ nowState: "quiet", journeyPhase: undefined })).toBe("preparing");
  });

  it("every stage has a theme with fallback copy", () => {
    const stages: JourneyStage[] = [
      "preparing",
      "transit",
      "bangkok",
      "island_approach",
      "pickup",
      "in_house",
    ];
    for (const s of stages) {
      const theme = STAGE_THEMES[s];
      expect(theme.stage).toBe(s);
      expect(theme.titleFallback.length).toBeGreaterThan(2);
      expect(theme.lineFallback.length).toBeGreaterThan(10);
      expect(theme.tintClass).toMatch(/^journey-tint-/);
    }
  });
});
