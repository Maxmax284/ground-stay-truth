import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * recoveryLink captures the Supabase password-recovery token from the URL
 * *before* supabase-js can consume/strip it. These tests cover all three link
 * shapes plus the expired/used error shape.
 */

const KEY = "lmt_recovery_payload";

function setUrl(url: string) {
  window.history.replaceState(null, "", url);
}

async function loadFresh() {
  vi.resetModules();
  return await import("../recoveryLink");
}

describe("captureRecoveryLink", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setUrl("/");
  });

  it("captures implicit hash tokens and pins the URL to /reset-password", async () => {
    setUrl("/#access_token=abc123&refresh_token=ref456&type=recovery");
    await loadFresh();

    const stored = JSON.parse(sessionStorage.getItem(KEY)!);
    expect(stored.access_token).toBe("abc123");
    expect(stored.refresh_token).toBe("ref456");
    expect(window.location.pathname).toBe("/reset-password");
    expect(window.location.hash).toBe("");
  });

  it("captures a PKCE ?code= link on the reset route", async () => {
    setUrl("/reset-password?code=pkce-code-789");
    await loadFresh();

    const stored = JSON.parse(sessionStorage.getItem(KEY)!);
    expect(stored.code).toBe("pkce-code-789");
    expect(stored.access_token).toBeUndefined();
    expect(window.location.search).toBe("");
  });

  it("captures a token_hash link with type=recovery from any route", async () => {
    setUrl("/?token_hash=hash-abc&type=recovery");
    await loadFresh();

    const stored = JSON.parse(sessionStorage.getItem(KEY)!);
    expect(stored.token_hash).toBe("hash-abc");
    expect(window.location.pathname).toBe("/reset-password");
  });

  it("captures the legacy ?token= param as token_hash", async () => {
    setUrl("/reset-password?token=legacy-token");
    await loadFresh();

    const stored = JSON.parse(sessionStorage.getItem(KEY)!);
    expect(stored.token_hash).toBe("legacy-token");
  });

  it("captures the expired/used error shape", async () => {
    setUrl("/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    await loadFresh();

    const stored = JSON.parse(sessionStorage.getItem(KEY)!);
    expect(stored.error).toBe("otp_expired");
    expect(stored.error_description).toMatch(/expired/i);
    expect(window.location.hash).toBe("");
  });

  it("ignores unrelated URLs", async () => {
    setUrl("/index?foo=bar");
    await loadFresh();

    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(window.location.pathname).toBe("/index");
  });

  it("does not treat a bare ?code= on a non-reset route as recovery (OAuth callback)", async () => {
    setUrl("/auth?code=oauth-code");
    await loadFresh();

    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});

describe("consumeRecoveryPayload", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setUrl("/");
  });

  it("returns the payload once and clears it (single use)", async () => {
    setUrl("/reset-password?code=one-shot");
    const mod = await loadFresh();

    expect(mod.consumeRecoveryPayload()?.code).toBe("one-shot");
    expect(mod.consumeRecoveryPayload()).toBeNull();
  });

  it("returns null when nothing was captured", async () => {
    const mod = await loadFresh();
    expect(mod.consumeRecoveryPayload()).toBeNull();
  });
});
