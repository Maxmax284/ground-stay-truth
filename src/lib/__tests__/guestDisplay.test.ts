import { describe, expect, it } from "vitest";
import { resolveGuestDisplayName } from "../guestDisplay";

describe("account owner and staying guest remain separate", () => {
  it("shows Rob's booking name without replacing Kenny's account name", () => {
    const account = { full_name: "Kenny Gayle", email: "owner@example.test" };
    expect(resolveGuestDisplayName({ profiles: account, manual_guest_name: "Rob Smith" })).toBe("Rob Smith");
    expect(account.full_name).toBe("Kenny Gayle");
  });
  it("shows Kenny for his own booking", () => {
    expect(resolveGuestDisplayName({ profiles: { full_name: "Kenny Gayle" }, manual_guest_name: "Kenny Gayle" })).toBe("Kenny Gayle");
  });
  it("falls back to account name when no staying guest was specified", () => {
    expect(resolveGuestDisplayName({ profiles: { full_name: "Kenny Gayle" }, manual_guest_name: "  " })).toBe("Kenny Gayle");
  });
});