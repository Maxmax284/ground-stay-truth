import { describe, it, expect } from "vitest";
import {
  DEFAULT_DEVICE_POLICY,
  canEnableDeviceRecognition,
  computeDeviceExpiry,
  describeDevice,
  deviceDisplayStatus,
  deviceGateDecision,
  deviceRecognitionAppliesTo,
  isDeviceExpired,
  isDeviceRestricted,
  parseDevicePolicy,
} from "@/lib/deviceRecognition";

const NOW = Date.parse("2026-08-11T00:00:00Z");

describe("device policy defaults", () => {
  it("is OFF with no settings saved", () => {
    expect(parseDevicePolicy([]).enabled).toBe(false);
    expect(parseDevicePolicy(null).enabled).toBe(false);
    expect(DEFAULT_DEVICE_POLICY.enabled).toBe(false);
  });

  it("reads saved values, including quoted json", () => {
    const p = parseDevicePolicy([
      { key: "device_recognition_enabled", value: "true" },
      { key: "device_self_approval", value: false },
      { key: "device_trust_days", value: "\"90\"" },
    ]);
    expect(p.enabled).toBe(true);
    expect(p.allowSelfApproval).toBe(false);
    expect(p.trustDays).toBe(90);
  });
});

describe("gate decisions", () => {
  const on = { ...DEFAULT_DEVICE_POLICY, enabled: true };

  it("never applies while disabled — existing admin login untouched", () => {
    expect(deviceGateDecision({ policy: DEFAULT_DEVICE_POLICY, role: "admin", device: null })).toBe(
      "not_required"
    );
  });

  it("only applies to admin-level roles", () => {
    for (const role of ["manager", "front_desk", "viewer", "maintenance", "guest", null]) {
      expect(deviceGateDecision({ policy: on, role, device: null })).toBe("not_required");
      expect(deviceRecognitionAppliesTo(role)).toBe(false);
    }
    expect(deviceRecognitionAppliesTo("admin")).toBe(true);
  });

  it("requires approval for a new or pending device", () => {
    expect(deviceGateDecision({ policy: on, role: "admin", device: null })).toBe("approval_required");
    expect(
      deviceGateDecision({ policy: on, role: "admin", device: { status: "pending" } })
    ).toBe("approval_required");
  });

  it("lets a trusted, unexpired device through", () => {
    const state = deviceGateDecision({
      policy: on,
      role: "admin",
      device: { status: "trusted", expires_at: new Date(NOW + 1000).toISOString() },
      now: NOW,
    });
    expect(state).toBe("satisfied");
    expect(isDeviceRestricted(state)).toBe(false);
  });

  it("re-challenges expired trust and flags revoked/blocked", () => {
    expect(
      deviceGateDecision({
        policy: on,
        role: "admin",
        device: { status: "trusted", expires_at: new Date(NOW - 1).toISOString() },
        now: NOW,
      })
    ).toBe("approval_required");
    expect(deviceGateDecision({ policy: on, role: "admin", device: { status: "revoked" } })).toBe("revoked");
    expect(deviceGateDecision({ policy: on, role: "admin", device: { status: "blocked" } })).toBe("blocked");
    expect(isDeviceRestricted("blocked")).toBe(true);
  });
});

describe("lockout guard", () => {
  it("blocks enabling with zero trusted devices", () => {
    expect(canEnableDeviceRecognition([])).toBe(false);
    expect(canEnableDeviceRecognition([{ status: "pending" }])).toBe(false);
    expect(
      canEnableDeviceRecognition([{ status: "trusted", expires_at: new Date(NOW - 1).toISOString() }], NOW)
    ).toBe(false);
  });

  it("allows enabling once a device is trusted", () => {
    expect(canEnableDeviceRecognition([{ status: "trusted", expires_at: null }], NOW)).toBe(true);
  });
});

describe("expiry", () => {
  it("never expires at 0 days", () => {
    expect(computeDeviceExpiry(0, NOW)).toBeNull();
    expect(isDeviceExpired(null, NOW)).toBe(false);
  });
  it("computes a future expiry and fails closed on garbage", () => {
    expect(computeDeviceExpiry(30, NOW)).toBe(new Date(NOW + 30 * 86400000).toISOString());
    expect(isDeviceExpired("not-a-date", NOW)).toBe(true);
  });
  it("labels expired trust in the UI", () => {
    expect(
      deviceDisplayStatus({ status: "trusted", expires_at: new Date(NOW - 1).toISOString() }, NOW)
    ).toBe("expired");
  });
});

describe("device labels", () => {
  it("stays human-friendly", () => {
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36").label)
      .toBe("Chrome on MacBook");
    const iphone = describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1 Version/17.0 Safari/604.1");
    expect(iphone.label).toBe("Safari on iPhone");
    expect(iphone.deviceType).toBe("phone");
    expect(describeDevice("").label).toBe("Unknown device");
  });
});
