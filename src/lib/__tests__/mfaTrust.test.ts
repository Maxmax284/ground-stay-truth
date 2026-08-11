/**
 * MFA trust window + role requirement tests.
 * Covers: trust expiry, role-change invalidation, tamper resistance, and which
 * roles are forced into MFA.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_TRUST_WINDOW_HOURS,
  MAX_TRUST_WINDOW_HOURS,
  MIN_TRUST_WINDOW_HOURS,
  clampTrustWindowHours,
  clearAllMfaTrust,
  clearMfaTrust,
  isDeviceTrusted,
  markMfaVerified,
  trustExpiresAt,
} from "@/lib/mfaTrust";
import { mfaRequiredForRole, MFA_MANDATORY_ROLES } from "@/hooks/useMfa";
import type { MfaPolicy } from "@/hooks/useMfa";

const HOUR = 60 * 60 * 1000;
const USER = "user-1";

const policy: MfaPolicy = {
  requiredForAdmin: true,
  requiredForManager: false,
  requiredForStaff: false,
  gracePeriodDays: 7,
  requireForSensitiveActions: true,
  trustWindowHours: DEFAULT_TRUST_WINDOW_HOURS,
};

describe("mfa trust window", () => {
  beforeEach(() => clearAllMfaTrust());

  it("defaults to a 12 hour window", () => {
    expect(DEFAULT_TRUST_WINDOW_HOURS).toBe(12);
  });

  it("is untrusted before any verification", () => {
    expect(isDeviceTrusted({ userId: USER, role: "admin" })).toBe(false);
  });

  it("trusts the device right after verification", () => {
    markMfaVerified(USER, "admin");
    expect(isDeviceTrusted({ userId: USER, role: "admin", windowHours: 12 })).toBe(true);
  });

  it("expires exactly at the end of the window", () => {
    markMfaVerified(USER, "admin");
    const now = Date.now();
    expect(isDeviceTrusted({ userId: USER, role: "admin", windowHours: 12, now: now + 11 * HOUR })).toBe(true);
    expect(isDeviceTrusted({ userId: USER, role: "admin", windowHours: 12, now: now + 13 * HOUR })).toBe(false);
  });

  it("re-challenges when the role changes (elevation or downgrade)", () => {
    markMfaVerified(USER, "manager");
    expect(isDeviceTrusted({ userId: USER, role: "admin" })).toBe(false);
  });

  it("refuses future-dated stamps (clock tampering)", () => {
    markMfaVerified(USER, "admin");
    const now = Date.now();
    expect(isDeviceTrusted({ userId: USER, role: "admin", now: now - 10 * HOUR })).toBe(false);
  });

  it("clearMfaTrust revokes trust for that user only", () => {
    markMfaVerified(USER, "admin");
    markMfaVerified("user-2", "admin");
    clearMfaTrust(USER);
    expect(isDeviceTrusted({ userId: USER, role: "admin" })).toBe(false);
    expect(isDeviceTrusted({ userId: "user-2", role: "admin" })).toBe(true);
  });

  it("clearAllMfaTrust revokes every device record", () => {
    markMfaVerified(USER, "admin");
    clearAllMfaTrust();
    expect(isDeviceTrusted({ userId: USER, role: "admin" })).toBe(false);
  });

  it("clamps the window into the allowed range", () => {
    expect(clampTrustWindowHours(0)).toBe(MIN_TRUST_WINDOW_HOURS);
    expect(clampTrustWindowHours(99999)).toBe(MAX_TRUST_WINDOW_HOURS);
    expect(clampTrustWindowHours(Number.NaN)).toBe(DEFAULT_TRUST_WINDOW_HOURS);
    expect(clampTrustWindowHours(12)).toBe(12);
  });

  it("reports when the window expires", () => {
    markMfaVerified(USER, "admin");
    const expires = trustExpiresAt({ userId: USER, windowHours: 12 });
    expect(expires).not.toBeNull();
    expect(expires! - Date.now()).toBeGreaterThan(11.5 * HOUR);
  });

  it("stores no secrets — only a timestamp and role", () => {
    markMfaVerified(USER, "admin");
    const raw = window.localStorage.getItem("mfa.trust.v1") ?? "";
    expect(raw).not.toMatch(/secret|code|token/i);
    expect(Object.keys(JSON.parse(raw)[USER]).sort()).toEqual(["role", "verifiedAt"]);
  });
});

describe("mfa role requirement", () => {
  it("forces MFA on admin", () => {
    expect(MFA_MANDATORY_ROLES).toContain("admin");
    expect(mfaRequiredForRole("admin", policy)).toBe(true);
  });

  it("keeps admin required even if the stored policy says otherwise", () => {
    expect(mfaRequiredForRole("admin", { ...policy, requiredForAdmin: false })).toBe(true);
  });

  it("does not force manager by default", () => {
    expect(mfaRequiredForRole("manager", policy)).toBe(false);
  });

  it("does not force lower staff roles by default", () => {
    for (const role of ["front_desk_supervisor", "front_desk", "viewer", "maintenance"] as const) {
      expect(mfaRequiredForRole(role, policy)).toBe(false);
    }
  });

  it("never forces guests", () => {
    expect(mfaRequiredForRole("guest", policy)).toBe(false);
    expect(mfaRequiredForRole("guest", { ...policy, requiredForStaff: true })).toBe(false);
  });

  it("honours opt-in configuration for lower roles", () => {
    expect(mfaRequiredForRole("manager", { ...policy, requiredForManager: true })).toBe(true);
    expect(mfaRequiredForRole("front_desk", { ...policy, requiredForStaff: true })).toBe(true);
  });
});
