import { describe, it, expect } from "vitest";
import { classifyIntent, isGlobalScopeRequest } from "@/lib/aiIntent";
import { getShortcut, resolveShortcutTargets, type SpotlightRow } from "@/lib/aiShortcuts";

describe("classifyIntent", () => {
  it("treats front-desk lookups as simple", () => {
    expect(classifyIntent("Who's checking in today?")).toBe("simple_lookup");
    expect(classifyIntent("How many check-outs today?")).toBe("simple_lookup");
  });

  it("treats action phrasing as an action request", () => {
    expect(classifyIntent("Mark room 4 as cleaned")).toBe("action_request");
  });

  it("allows depth when asked for it", () => {
    expect(classifyIntent("Explain in detail why this booking failed payment")).toBe("deep_analysis");
  });
});

describe("isGlobalScopeRequest", () => {
  it("detects platform-wide asks", () => {
    expect(isGlobalScopeRequest("across the whole platform, who owes money?")).toBe(true);
    expect(isGlobalScopeRequest("who owes money?")).toBe(false);
  });
});

describe("resolveShortcutTargets", () => {
  const rows: SpotlightRow[] = [
    { id: "a", kind: "booking", tags: ["check_in_today", "balance_due"] },
    { id: "b", kind: "booking", tags: ["check_out_today"] },
    { id: "c", kind: "task", tags: ["housekeeping_today"] },
  ];

  it("matches by kind and tag", () => {
    expect(resolveShortcutTargets(getShortcut("check_ins_today")!, rows)).toEqual(["a"]);
    expect(resolveShortcutTargets(getShortcut("payments_due")!, rows)).toEqual(["a"]);
    expect(resolveShortcutTargets(getShortcut("housekeeping_today")!, rows)).toEqual(["c"]);
  });

  it("returns nothing when the page has no matches", () => {
    expect(resolveShortcutTargets(getShortcut("open_maintenance")!, rows)).toEqual([]);
  });
});
