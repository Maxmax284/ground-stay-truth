import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { clampPos, panelBoxClasses, readStoredPos, writeStoredPos } from "@/lib/aiPanelLayout";

describe("Kru Glitch panel layout", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
  });
  afterEach(() => window.localStorage.clear());

  it("keeps the panel inside the viewport", () => {
    const size = { width: 500, height: 700 };
    expect(clampPos({ x: -400, y: -200 }, size)).toEqual({ x: 8, y: 8 });
    const far = clampPos({ x: 5000, y: 5000 }, size);
    expect(far.x).toBeLessThanOrEqual(1440 - 500);
    expect(far.y).toBeLessThanOrEqual(900 - 700);
  });

  it("never returns a negative position for oversized panels", () => {
    const pos = clampPos({ x: 0, y: 0 }, { width: 2000, height: 2000 });
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
  });

  it("gives each display mode a distinct readable box", () => {
    expect(panelBoxClasses("compact")).toContain("w-[360px]");
    expect(panelBoxClasses("normal")).toContain("w-[500px]");
    expect(panelBoxClasses("expanded")).toContain("1100px");
  });

  it("round-trips the stored position and clears it", () => {
    writeStoredPos({ x: 120, y: 60 });
    expect(readStoredPos()).toEqual({ x: 120, y: 60 });
    writeStoredPos(null);
    expect(readStoredPos()).toBeNull();
  });

  it("ignores corrupt stored positions", () => {
    window.localStorage.setItem("ai.panelPos", "not json");
    expect(readStoredPos()).toBeNull();
  });
});
