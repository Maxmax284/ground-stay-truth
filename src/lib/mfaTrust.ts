/**
 * MFA trusted-device window.
 *
 * SECURITY NOTES
 *  - Nothing secret is stored here. Only a per-user "last verified at" stamp,
 *    used to decide whether to ask for a fresh 6-digit code. No TOTP secret,
 *    no backup code, no token ever touches localStorage.
 *  - Fail-closed: a missing / malformed / future-dated stamp means "not
 *    trusted", so the user gets challenged.
 *  - The real authority is the Supabase session assurance level (AAL2). This
 *    window only makes the challenge *less* frequent, never more permissive
 *    than the session itself.
 */

const STORAGE_KEY = "mfa.trust.v1";

export const DEFAULT_TRUST_WINDOW_HOURS = 12;
export const MIN_TRUST_WINDOW_HOURS = 1;
export const MAX_TRUST_WINDOW_HOURS = 24 * 30; // 30 days

export interface TrustRecord {
  /** Epoch ms of the last successful MFA verification on this device */
  verifiedAt: number;
  /** Role at verification time — a role change re-challenges */
  role?: string | null;
}

type TrustMap = Record<string, TrustRecord>;

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function readMap(): TrustMap {
  const store = safeStorage();
  if (!store) return {};
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as TrustMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: TrustMap) {
  const store = safeStorage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage full / blocked — treat as untrusted next time */
  }
}

export function clampTrustWindowHours(hours: number): number {
  if (!Number.isFinite(hours)) return DEFAULT_TRUST_WINDOW_HOURS;
  return Math.min(MAX_TRUST_WINDOW_HOURS, Math.max(MIN_TRUST_WINDOW_HOURS, Math.round(hours)));
}

export function getTrustRecord(userId: string | null | undefined): TrustRecord | null {
  if (!userId) return null;
  const rec = readMap()[userId];
  if (!rec || typeof rec.verifiedAt !== "number" || !Number.isFinite(rec.verifiedAt)) return null;
  return rec;
}

/** Record a successful MFA verification for this user on this device. */
export function markMfaVerified(userId: string | null | undefined, role?: string | null) {
  if (!userId) return;
  const map = readMap();
  map[userId] = { verifiedAt: Date.now(), role: role ?? null };
  writeMap(map);
}

/** Drop trust for one user (sign-out, MFA reset, password change, role change). */
export function clearMfaTrust(userId: string | null | undefined) {
  if (!userId) return;
  const map = readMap();
  delete map[userId];
  writeMap(map);
}

/** Drop trust for every user on this device. */
export function clearAllMfaTrust() {
  const store = safeStorage();
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export interface TrustCheckArgs {
  userId: string | null | undefined;
  role?: string | null;
  windowHours?: number;
  now?: number;
}

/**
 * True when this device verified MFA recently enough (and under the same role).
 * Any doubt returns false.
 */
export function isDeviceTrusted({ userId, role, windowHours, now = Date.now() }: TrustCheckArgs): boolean {
  const rec = getTrustRecord(userId);
  if (!rec) return false;
  // Clock skew or tampering — refuse.
  if (rec.verifiedAt > now + 60_000) return false;
  // Role elevation/change invalidates the window.
  if (role !== undefined && (rec.role ?? null) !== (role ?? null)) return false;
  const ms = clampTrustWindowHours(windowHours ?? DEFAULT_TRUST_WINDOW_HOURS) * 60 * 60 * 1000;
  return now - rec.verifiedAt < ms;
}

/** Epoch ms when the current trust window expires, or null when untrusted. */
export function trustExpiresAt({ userId, windowHours }: Omit<TrustCheckArgs, "now" | "role">): number | null {
  const rec = getTrustRecord(userId);
  if (!rec) return null;
  return rec.verifiedAt + clampTrustWindowHours(windowHours ?? DEFAULT_TRUST_WINDOW_HOURS) * 60 * 60 * 1000;
}
