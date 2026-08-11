/**
 * useOpsUnlock — BUSINESS-CRITICAL
 * -----------------------------------------------------------------------------
 * React state for the ops passcode gate.
 *
 * Behaviour:
 *  - Reads status on mount (and when the tab becomes visible again).
 *  - Keeps a live countdown so the UI can show "locked in 4m".
 *  - Slides the idle window forward on real user activity, throttled to once a
 *    minute, so working staff are not re-prompted mid-task.
 *  - Everyone is gated, admins included. If no code is configured the gate
 *    reports open, so the platform can never lock itself out.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  clearOpsUnlockToken,
  fetchOpsStatus,
  getOpsUnlockToken,
  lockOps,
  touchOps,
  unlockOps,
  type OpsPasscodeStatus,
} from "@/lib/opsUnlock";

const TOUCH_THROTTLE_MS = 60_000;

export function useOpsUnlock() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [unlocking, setUnlocking] = useState(false);
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const lastTouch = useRef(0);

  const status = useQuery({
    queryKey: ["ops-passcode-status", user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: fetchOpsStatus,
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const data: OpsPasscodeStatus | undefined = status.data;

  const msLeft = useMemo(() => {
    if (!data?.expiresAt) return 0;
    return Math.max(0, new Date(data.expiresAt).getTime() - now);
  }, [data?.expiresAt, now]);

  const lockoutMsLeft = useMemo(() => {
    if (!data?.lockedOutUntil) return 0;
    return Math.max(0, new Date(data.lockedOutUntil).getTime() - now);
  }, [data?.lockedOutUntil, now]);

  // The window lapsed locally — drop the token and re-check so UI locks itself.
  useEffect(() => {
    if (data?.configured && data.unlocked && data.expiresAt && msLeft === 0) {
      clearOpsUnlockToken();
      status.refetch();
    }
  }, [data?.configured, data?.unlocked, data?.expiresAt, msLeft, status]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["ops-passcode-status"] });
  }, [queryClient]);

  const unlock = useCallback(
    async (code: string) => {
      setUnlocking(true);
      setAttemptError(null);
      try {
        await unlockOps(code);
        refresh();
        return true;
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === "wrong_code") setAttemptError("wrong_code");
        else if (err.code === "locked_out") setAttemptError("locked_out");
        else setAttemptError(err.message || "failed");
        refresh();
        return false;
      } finally {
        setUnlocking(false);
      }
    },
    [refresh],
  );

  const lock = useCallback(async () => {
    await lockOps();
    refresh();
  }, [refresh]);

  /** Call from real user activity inside a gated surface. Throttled. */
  const keepAlive = useCallback(async () => {
    if (!getOpsUnlockToken()) return;
    if (Date.now() - lastTouch.current < TOUCH_THROTTLE_MS) return;
    lastTouch.current = Date.now();
    try {
      const next = await touchOps();
      if (!next.unlocked) refresh();
    } catch {
      /* keep-alive is best effort */
    }
  }, [refresh]);

  return {
    loading: status.isLoading,
    configured: data?.configured ?? false,
    /** Gate open means either no code is configured or this tab is unlocked. */
    unlocked: data?.unlocked ?? false,
    gateOpen: data?.gateOpen ?? false,
    expiresAt: data?.expiresAt ?? null,
    updatedAt: data?.updatedAt ?? null,
    msLeft,
    lockoutMsLeft,
    lockedOut: lockoutMsLeft > 0,
    unlocking,
    attemptError,
    clearAttemptError: () => setAttemptError(null),
    unlock,
    lock,
    keepAlive,
    refresh,
  };
}

/** "4m 12s" for countdown labels. */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}
