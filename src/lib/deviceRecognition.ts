/**
 * Admin device recognition — pure logic + local device identity.
 *
 * MFA answers "is this really the admin?".
 * Device recognition answers "do we trust the machine they're on?".
 *
 * SECURITY NOTES
 *  - The only thing stored on the device is a random opaque id (no secrets,
 *    no tokens, no fingerprint of the user). Losing it just means the device
 *    looks new and needs approval again.
 *  - Fail-closed when enforcement is ON: anything we can't positively call
 *    "trusted and unexpired" is treated as needing approval.
 *  - Default OFF: with no policy rows in the database, enforcement is off and
 *    nothing about the existing login/MFA flow changes.
 */

export const DEVICE_KEY_STORAGE = "device.id.v1";

export type DeviceStatus = "trusted" | "pending" | "revoked" | "blocked";
export type DeviceType = "laptop" | "desktop" | "phone" | "tablet" | "browser" | "unknown";

/** Roles that device recognition applies to. Admin-level only. */
export const DEVICE_ENFORCED_ROLES = ["admin"] as const;

export function deviceRecognitionAppliesTo(role: string | null | undefined): boolean {
  return !!role && (DEVICE_ENFORCED_ROLES as readonly string[]).includes(role);
}

/* -------------------------------------------------------------------------- */
/* Policy                                                                      */
/* -------------------------------------------------------------------------- */

export interface DevicePolicy {
  /** Master switch. OFF by default — devices are logged, never blocked. */
  enabled: boolean;
  /** Require approval of a new admin device before full access. */
  requireApproval: boolean;
  /** Admin may trust their own device right after passing MFA. */
  allowSelfApproval: boolean;
  /** New devices always get an MFA challenge first. */
  requireMfaOnNewDevice: boolean;
  /** Days a device stays trusted. 0 = never expires. */
  trustDays: number;
  revokeOnPasswordChange: boolean;
  revokeOnMfaReset: boolean;
  revokeOnRoleChange: boolean;
}

export const DEFAULT_DEVICE_POLICY: DevicePolicy = {
  enabled: false,
  requireApproval: true,
  allowSelfApproval: true,
  requireMfaOnNewDevice: true,
  trustDays: 30,
  revokeOnPasswordChange: true,
  revokeOnMfaReset: true,
  revokeOnRoleChange: true,
};

export const DEVICE_TRUST_DAY_OPTIONS = [0, 7, 30, 90] as const;

export const DEVICE_POLICY_KEYS = {
  enabled: "device_recognition_enabled",
  requireApproval: "device_require_approval",
  allowSelfApproval: "device_self_approval",
  requireMfaOnNewDevice: "device_require_mfa_new",
  trustDays: "device_trust_days",
  revokeOnPasswordChange: "device_revoke_on_password_change",
  revokeOnMfaReset: "device_revoke_on_mfa_reset",
  revokeOnRoleChange: "device_revoke_on_role_change",
} as const;

function coerceBool(raw: unknown, fallback: boolean): boolean {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw === "boolean") return raw;
  const s = String(raw).replace(/^"|"$/g, "").toLowerCase();
  if (s === "true") return true;
  if (s === "false") return false;
  return fallback;
}

function coerceNum(raw: unknown, fallback: number): number {
  if (raw === undefined || raw === null) return fallback;
  const n = Number(String(raw).replace(/^"|"$/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

export function parseDevicePolicy(
  rows: Array<{ key: string; value: unknown }> | null | undefined
): DevicePolicy {
  if (!rows || rows.length === 0) return { ...DEFAULT_DEVICE_POLICY };
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    enabled: coerceBool(map.get(DEVICE_POLICY_KEYS.enabled), DEFAULT_DEVICE_POLICY.enabled),
    requireApproval: coerceBool(
      map.get(DEVICE_POLICY_KEYS.requireApproval),
      DEFAULT_DEVICE_POLICY.requireApproval
    ),
    allowSelfApproval: coerceBool(
      map.get(DEVICE_POLICY_KEYS.allowSelfApproval),
      DEFAULT_DEVICE_POLICY.allowSelfApproval
    ),
    requireMfaOnNewDevice: coerceBool(
      map.get(DEVICE_POLICY_KEYS.requireMfaOnNewDevice),
      DEFAULT_DEVICE_POLICY.requireMfaOnNewDevice
    ),
    trustDays: coerceNum(map.get(DEVICE_POLICY_KEYS.trustDays), DEFAULT_DEVICE_POLICY.trustDays),
    revokeOnPasswordChange: coerceBool(
      map.get(DEVICE_POLICY_KEYS.revokeOnPasswordChange),
      DEFAULT_DEVICE_POLICY.revokeOnPasswordChange
    ),
    revokeOnMfaReset: coerceBool(
      map.get(DEVICE_POLICY_KEYS.revokeOnMfaReset),
      DEFAULT_DEVICE_POLICY.revokeOnMfaReset
    ),
    revokeOnRoleChange: coerceBool(
      map.get(DEVICE_POLICY_KEYS.revokeOnRoleChange),
      DEFAULT_DEVICE_POLICY.revokeOnRoleChange
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Local device identity                                                      */
/* -------------------------------------------------------------------------- */

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Opaque, per-browser device id. Created on first use. Never a secret. */
export function getOrCreateDeviceKey(): string {
  const store = safeStorage();
  if (!store) return randomId();
  try {
    const existing = store.getItem(DEVICE_KEY_STORAGE);
    if (existing && existing.length >= 8) return existing;
    const fresh = randomId();
    store.setItem(DEVICE_KEY_STORAGE, fresh);
    return fresh;
  } catch {
    return randomId();
  }
}

export function clearDeviceKey() {
  try {
    safeStorage()?.removeItem(DEVICE_KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------------------------------- */
/* Human-friendly description                                                 */
/* -------------------------------------------------------------------------- */

export interface DeviceDescription {
  label: string;
  deviceType: DeviceType;
  browser: string;
  os: string;
}

export function describeDevice(userAgent: string | null | undefined): DeviceDescription {
  const ua = (userAgent ?? "").trim();
  if (!ua) {
    return { label: "Unknown device", deviceType: "unknown", browser: "Unknown browser", os: "Unknown OS" };
  }

  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\/|Opera/i.test(ua)
      ? "Opera"
      : /Chrome\//i.test(ua) && !/Chromium/i.test(ua)
        ? "Chrome"
        : /Chromium/i.test(ua)
          ? "Chromium"
          : /Firefox\//i.test(ua)
            ? "Firefox"
            : /Safari\//i.test(ua)
              ? "Safari"
              : "Browser";

  const isIpad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
  const isIphone = /iPhone|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isAndroidTablet = isAndroid && !/Mobile/i.test(ua);

  const os = isIpad
    ? "iPadOS"
    : isIphone
      ? "iOS"
      : isAndroid
        ? "Android"
        : /Windows/i.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/i.test(ua)
            ? "macOS"
            : /CrOS/i.test(ua)
              ? "ChromeOS"
              : /Linux/i.test(ua)
                ? "Linux"
                : "Unknown OS";

  let deviceType: DeviceType = "browser";
  if (isIphone || (isAndroid && !isAndroidTablet)) deviceType = "phone";
  else if (isIpad || isAndroidTablet) deviceType = "tablet";
  else if (os === "macOS" || os === "ChromeOS") deviceType = "laptop";
  else if (os === "Windows" || os === "Linux") deviceType = "desktop";

  const hardware = isIpad
    ? "iPad"
    : isIphone
      ? "iPhone"
      : isAndroid
        ? isAndroidTablet
          ? "Android tablet"
          : "Android phone"
        : os === "macOS"
          ? "MacBook"
          : os === "Windows"
            ? "Windows laptop"
            : os === "ChromeOS"
              ? "Chromebook"
              : os === "Linux"
                ? "Linux machine"
                : "device";

  return { label: `${browser} on ${hardware}`, deviceType, browser, os };
}

/* -------------------------------------------------------------------------- */
/* Expiry                                                                     */
/* -------------------------------------------------------------------------- */

/** ISO expiry for a freshly approved device, or null when trust never expires. */
export function computeDeviceExpiry(trustDays: number, now: number = Date.now()): string | null {
  const days = coerceNum(trustDays, DEFAULT_DEVICE_POLICY.trustDays);
  if (days <= 0) return null;
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}

export function isDeviceExpired(expiresAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (!Number.isFinite(t)) return true; // unreadable → fail closed
  return t <= now;
}

/* -------------------------------------------------------------------------- */
/* Gate decision                                                              */
/* -------------------------------------------------------------------------- */

export interface DeviceRecord {
  id?: string;
  status: DeviceStatus;
  expires_at?: string | null;
}

export type DeviceGateState =
  | "loading"
  /** Enforcement off, or the role isn't admin-level */
  | "not_required"
  /** Trusted, unexpired device */
  | "satisfied"
  /** New / pending / expired device — needs approval before admin access */
  | "approval_required"
  /** Trust was pulled — needs approval again */
  | "revoked"
  /** Explicitly blocked — an authorized admin must unblock */
  | "blocked";

export interface DeviceGateArgs {
  policy: DevicePolicy;
  role: string | null | undefined;
  device: DeviceRecord | null | undefined;
  now?: number;
}

export function deviceGateDecision({ policy, role, device, now = Date.now() }: DeviceGateArgs): DeviceGateState {
  if (!policy.enabled) return "not_required";
  if (!deviceRecognitionAppliesTo(role)) return "not_required";
  if (!policy.requireApproval) return "not_required";
  if (!device) return "approval_required";
  if (device.status === "blocked") return "blocked";
  if (device.status === "revoked") return "revoked";
  if (device.status === "trusted") {
    return isDeviceExpired(device.expires_at, now) ? "approval_required" : "satisfied";
  }
  return "approval_required";
}

/** True when admin surfaces/Ops must stay locked for this device. */
export function isDeviceRestricted(state: DeviceGateState): boolean {
  return state === "approval_required" || state === "revoked" || state === "blocked";
}

/** UI label for a device row. */
export function deviceDisplayStatus(
  device: DeviceRecord,
  now: number = Date.now()
): "trusted" | "pending" | "revoked" | "blocked" | "expired" {
  if (device.status === "trusted" && isDeviceExpired(device.expires_at, now)) return "expired";
  return device.status;
}

/* -------------------------------------------------------------------------- */
/* Lockout guard                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Enforcement may only be switched on when at least one admin-level device is
 * already trusted (and not expired). Prevents an instant self-lockout.
 */
export function canEnableDeviceRecognition(
  devices: DeviceRecord[] | null | undefined,
  now: number = Date.now()
): boolean {
  return !!devices?.some((d) => d.status === "trusted" && !isDeviceExpired(d.expires_at, now));
}

/* -------------------------------------------------------------------------- */
/* Cross-module restriction flag (Ops Control Mode reads this)                */
/* -------------------------------------------------------------------------- */

let deviceRestricted = false;

export function setDeviceRestricted(restricted: boolean) {
  deviceRestricted = restricted;
}

/** True when the current device is not approved and enforcement is on. */
export function isCurrentDeviceRestricted(): boolean {
  return deviceRestricted;
}
