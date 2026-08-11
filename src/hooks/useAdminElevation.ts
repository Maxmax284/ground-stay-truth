/**
 * useAdminElevation — BUSINESS-CRITICAL
 * -----------------------------------------------------------------------------
 * Break-glass admin elevation. An admin can open a time-boxed window (max 15
 * minutes) either on their own account or for another staff member, unlocking
 * admin-only actions without a permanent role change.
 *
 * Laws:
 *  - Only admins can issue a grant (enforced in the DB function, not here).
 *  - Hard TTL, reason required, auto-expiry — no indefinite elevation.
 *  - Every audited action taken during the window is tagged `elevated` in
 *    override_audit_log by a DB trigger, so the trail cannot be bypassed.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const ELEVATION_MAX_MINUTES = 15;
export const ELEVATION_DEFAULT_MINUTES = 15;

export interface ActiveElevation {
  id: string;
  reason: string;
  minutes: number;
  expires_at: string;
  self_issued: boolean;
  granted_by_user_id: string | null;
}

export interface ElevationGrantRow {
  id: string;
  subject_user_id: string;
  granted_by_user_id: string;
  self_issued: boolean;
  reason: string;
  minutes: number;
  expires_at: string;
  revoked_at: string | null;
  used_count: number;
  created_at: string;
}

/** The caller's own live elevation window, if any. Polls so expiry is visible. */
export function useMyElevation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());

  const query = useQuery({
    queryKey: ["my-elevation", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30_000,
    queryFn: async (): Promise<ActiveElevation | null> => {
      const { data, error } = await supabase.rpc("my_active_elevation");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as ActiveElevation) ?? null;
    },
  });

  // Local ticker so the countdown moves without hammering the network.
  useEffect(() => {
    if (!query.data) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [query.data]);

  const expiresAt = query.data ? new Date(query.data.expires_at).getTime() : 0;
  const secondsLeft = query.data ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;
  const isActive = !!query.data && secondsLeft > 0;

  // The moment it lapses, drop the cached grant so the banner disappears.
  useEffect(() => {
    if (query.data && secondsLeft === 0) {
      queryClient.invalidateQueries({ queryKey: ["my-elevation", user?.id] });
    }
  }, [query.data, secondsLeft, queryClient, user?.id]);

  const revoke = useMutation({
    mutationFn: async () => {
      if (!query.data) return;
      const { error } = await supabase.rpc("revoke_admin_elevation", {
        _grant_id: query.data.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-elevation"] });
      queryClient.invalidateQueries({ queryKey: ["elevation-grants"] });
    },
  });

  const countdown = useMemo(() => {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }, [secondsLeft]);

  return {
    elevation: isActive ? query.data : null,
    isActive,
    secondsLeft,
    countdown,
    isLoading: query.isLoading,
    revoke: revoke.mutateAsync,
    isRevoking: revoke.isPending,
  };
}

/** Admin-side: issue and review elevation grants. */
export function useElevationGrants() {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const isAdmin = role === "admin";

  const grants = useQuery({
    queryKey: ["elevation-grants"],
    enabled: isAdmin,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ElevationGrantRow[]> => {
      const { data, error } = await supabase
        .from("admin_elevation_grants")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as ElevationGrantRow[];
    },
  });

  const grant = useMutation({
    mutationFn: async (args: { subjectUserId?: string | null; reason: string; minutes?: number }) => {
      const { data, error } = await supabase.rpc("grant_admin_elevation", {
        _subject_user_id: args.subjectUserId ?? user?.id ?? null,
        _reason: args.reason,
        _minutes: Math.min(args.minutes ?? ELEVATION_DEFAULT_MINUTES, ELEVATION_MAX_MINUTES),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["elevation-grants"] });
      queryClient.invalidateQueries({ queryKey: ["my-elevation"] });
    },
  });

  const revoke = useMutation({
    mutationFn: async (grantId: string) => {
      const { error } = await supabase.rpc("revoke_admin_elevation", { _grant_id: grantId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["elevation-grants"] });
      queryClient.invalidateQueries({ queryKey: ["my-elevation"] });
    },
  });

  const isLive = useCallback((row: ElevationGrantRow) => {
    return !row.revoked_at && new Date(row.expires_at).getTime() > Date.now();
  }, []);

  return {
    grants: grants.data ?? [],
    isLoading: grants.isLoading,
    isAdmin,
    grant: grant.mutateAsync,
    isGranting: grant.isPending,
    revoke: revoke.mutateAsync,
    isRevoking: revoke.isPending,
    isLive,
  };
}
