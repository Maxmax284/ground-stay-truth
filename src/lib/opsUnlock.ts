/**
 * Ops passcode client — BUSINESS-CRITICAL
 * -----------------------------------------------------------------------------
 * Thin client for the `ops-passcode` edge function plus the tab-scoped token
 * store.
 *
 * Why sessionStorage: the unlock is deliberately hybrid — 15 minutes idle AND
 * tab-scoped. sessionStorage dies with the tab, and the backend revokes any
 * session whose token no longer shows up, so closing the tab really does lock
 * the gate again.
 *
 * The passcode itself never lives here. It is posted once, verified server-side,
 * and never stored in the browser.
 */
import { supabase } from "@/integrations/supabase/client";

const TOKEN_KEY = "campstay.ops_unlock_token";

export interface OpsPasscodeStatus {
  /** Has an admin configured a code at all? */
  configured: boolean;
  /** Can this user use the ops layer right now? */
  unlocked: boolean;
  /** True when no code is configured, so the gate is wide open. */
  gateOpen: boolean;
  /** When the current idle window lapses. */
  expiresAt: string | null;
  /** Set while this account is in a failed-attempt lockout. */
  lockedOutUntil: string | null;
  /** When the code was last set or rotated. */
  updatedAt: string | null;
}

export function getOpsUnlockToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function setOpsUnlockToken(token: string) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode — the gate simply stays locked */
  }
}

export function clearOpsUnlockToken() {
  setOpsUnlockToken("");
}

type RawResponse = Record<string, unknown>;

async function call(action: string, payload: Record<string, unknown> = {}): Promise<RawResponse> {
  const { data, error } = await supabase.functions.invoke("ops-passcode", {
    body: { action, token: getOpsUnlockToken(), ...payload },
  });
  if (error) {
    // Edge errors carry the JSON body; surface the machine-readable code when present.
    let code = "";
    let lockedOutUntil: string | null = null;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        code = String(body?.error ?? "");
        lockedOutUntil = body?.locked_out_until ?? null;
      }
    } catch {
      /* fall through to generic message */
    }
    const err = new Error(code || error.message || "Ops passcode request failed");
    (err as Error & { code?: string; lockedOutUntil?: string | null }).code = code;
    (err as Error & { lockedOutUntil?: string | null }).lockedOutUntil = lockedOutUntil;
    throw err;
  }
  return (data ?? {}) as RawResponse;
}

function toStatus(raw: RawResponse): OpsPasscodeStatus {
  return {
    configured: !!raw.configured,
    unlocked: !!raw.unlocked,
    gateOpen: !!raw.gate_open,
    expiresAt: (raw.expires_at as string) ?? null,
    lockedOutUntil: (raw.locked_out_until as string) ?? null,
    updatedAt: (raw.updated_at as string) ?? null,
  };
}

export async function fetchOpsStatus(): Promise<OpsPasscodeStatus> {
  return toStatus(await call("status"));
}

/** Verify a code and open a 15-minute idle window for this tab. */
export async function unlockOps(code: string): Promise<OpsPasscodeStatus> {
  const raw = await call("unlock", { code });
  if (typeof raw.token === "string" && raw.token) setOpsUnlockToken(raw.token);
  return toStatus(raw);
}

/** Slide the idle window forward while the user is actively working. */
export async function touchOps(): Promise<OpsPasscodeStatus> {
  if (!getOpsUnlockToken()) return fetchOpsStatus();
  const status = toStatus(await call("touch"));
  if (!status.unlocked) clearOpsUnlockToken();
  return status;
}

export async function lockOps(): Promise<void> {
  try {
    await call("lock");
  } finally {
    clearOpsUnlockToken();
  }
}

/** Admin: set the first code, or rotate an existing one (needs the current code). */
export async function setOpsPasscode(code: string, currentCode?: string): Promise<void> {
  await call("set", { code, current_code: currentCode ?? "" });
  clearOpsUnlockToken();
}

/** Admin: remove the gate entirely. Requires the current code. */
export async function clearOpsPasscode(currentCode: string): Promise<void> {
  await call("clear", { current_code: currentCode });
  clearOpsUnlockToken();
}

export const OPS_PASSCODE_MIN_LENGTH = 6;
