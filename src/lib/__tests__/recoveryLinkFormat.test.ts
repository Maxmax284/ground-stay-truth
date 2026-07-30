import { describe, it, expect, beforeEach, vi } from "vitest";
import { recoveryRedirectTo, buildRecoveryLink } from "../recoveryLink";

/**
 * Contract tests for the reset-link generator: the redirectTo we hand Supabase,
 * the three URL shapes built on top of it, and a round-trip through the
 * capture parser so a generated link is always readable by the reset page.
 */

const KEY = "lmt_recovery_payload";
const ORIGIN = "https://lmtcampstay.com";

describe("recoveryRedirectTo", () => {
  it("points at the same-origin /reset-password route", () => {
    expect(recoveryRedirectTo(ORIGIN)).toBe("https://lmtcampstay.com/reset-password");
  });

  it("never emits a double slash or trailing slash", () => {
    expect(recoveryRedirectTo("https://lmtcampstay.com/")).toBe("https://lmtcampstay.com/reset-password");
    expect(recoveryRedirectTo("http://localhost:8080")).toBe("http://localhost:8080/reset-password");
  });

  it("carries no query string or hash", () => {
    const url = new URL(recoveryRedirectTo(ORIGIN));
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
    expect(url.pathname).toBe("/reset-password");
  });
});

describe("buildRecoveryLink URL format", () => {
  it("hash tokens: implicit flow in the fragment", () => {
    const link = buildRecoveryLink("hash", { access_token: "at1", refresh_token: "rt1" }, ORIGIN);
    const url = new URL(link);
    const hash = new URLSearchParams(url.hash.slice(1));

    expect(url.origin + url.pathname).toBe(`${ORIGIN}/reset-password`);
    expect(url.search).toBe("");
    expect(hash.get("access_token")).toBe("at1");
    expect(hash.get("refresh_token")).toBe("rt1");
    expect(hash.get("type")).toBe("recovery");
  });

  it("PKCE: ?code= in the query string only", () => {
    const url = new URL(buildRecoveryLink("pkce", { code: "pkce-123" }, ORIGIN));

    expect(url.pathname).toBe("/reset-password");
    expect(url.searchParams.get("code")).toBe("pkce-123");
    expect(url.hash).toBe("");
    expect(url.searchParams.get("access_token")).toBeNull();
  });

  it("token_hash: ?token_hash= with type=recovery", () => {
    const url = new URL(buildRecoveryLink("token_hash", { token_hash: "th-abc" }, ORIGIN));

    expect(url.pathname).toBe("/reset-password");
    expect(url.searchParams.get("token_hash")).toBe("th-abc");
    expect(url.searchParams.get("type")).toBe("recovery");
    expect(url.hash).toBe("");
  });

  it("error: expired/used link shape in the fragment", () => {
    const hash = new URLSearchParams(new URL(buildRecoveryLink("error", {}, ORIGIN)).hash.slice(1));

    expect(hash.get("error")).toBe("access_denied");
    expect(hash.get("error_code")).toBe("otp_expired");
    expect(hash.get("error_description")).toMatch(/expired/i);
  });

  it("URL-encodes token values that contain reserved characters", () => {
    const url = new URL(buildRecoveryLink("pkce", { code: "a b+c/d=" }, ORIGIN));
    expect(url.searchParams.get("code")).toBe("a b+c/d=");
    expect(url.href).not.toContain("a b+c/d=");
  });
});

describe("generated links round-trip through the capture parser", () => {
  const load = async (link: string) => {
    const { pathname, search, hash } = new URL(link);
    window.history.replaceState(null, "", `${pathname}${search}${hash}`);
    vi.resetModules();
    const mod = await import("../recoveryLink");
    return mod.consumeRecoveryPayload();
  };

  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("parses a generated hash-token link", async () => {
    const payload = await load(buildRecoveryLink("hash", { access_token: "at", refresh_token: "rt" }, ORIGIN));
    expect(payload).toMatchObject({ access_token: "at", refresh_token: "rt" });
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("parses a generated PKCE link", async () => {
    expect(await load(buildRecoveryLink("pkce", { code: "c1" }, ORIGIN))).toMatchObject({ code: "c1" });
  });

  it("parses a generated token_hash link", async () => {
    expect(await load(buildRecoveryLink("token_hash", { token_hash: "h1" }, ORIGIN))).toMatchObject({
      token_hash: "h1",
    });
  });

  it("parses a generated expired-link error", async () => {
    expect(await load(buildRecoveryLink("error", {}, ORIGIN))).toMatchObject({ error: "otp_expired" });
  });
});
