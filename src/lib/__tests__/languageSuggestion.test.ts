import { describe, it, expect } from "vitest";
import { suggestLanguage, baseLanguage } from "@/lib/languageSuggestion";

describe("languageSuggestion", () => {
  it("offers the device language when it differs and is guest-ready", () => {
    expect(
      suggestLanguage({ deviceLocales: ["fr-FR", "en-US"], currentLanguage: "en" }),
    ).toBe("fr");
    expect(suggestLanguage({ deviceLocales: ["de-AT"], currentLanguage: "en" })).toBe("de");
  });

  it("stays silent when the device already matches", () => {
    expect(suggestLanguage({ deviceLocales: ["fr-CA"], currentLanguage: "fr" })).toBeNull();
  });

  it("never offers a language that isn't complete for guests", () => {
    expect(suggestLanguage({ deviceLocales: ["ru-RU", "ko-KR"], currentLanguage: "en" })).toBeNull();
  });

  it("respects a dismissal and an explicit manual choice", () => {
    expect(
      suggestLanguage({ deviceLocales: ["fr-FR"], currentLanguage: "en", dismissedCodes: ["fr"] }),
    ).toBeNull();
    expect(
      suggestLanguage({ deviceLocales: ["fr-FR"], currentLanguage: "en", chosenByUser: true }),
    ).toBeNull();
  });

  it("uses nothing but the device list — no itinerary, no nationality", () => {
    // An empty device list means no evidence, so no suggestion, even though a
    // caller might know the flight departs from Paris.
    expect(suggestLanguage({ deviceLocales: [], currentLanguage: "en" })).toBeNull();
  });

  it("normalises locale tags", () => {
    expect(baseLanguage("zh-Hans-CN")).toBe("zh");
    expect(baseLanguage("PT_br")).toBe("pt");
    expect(baseLanguage("")).toBe("");
  });
});
