import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

export type Severity = "urgent" | "attention" | "normal";

export interface CornerTalkLine {
  text: string;
  severity: Severity;
  messageKey: string;
}

export interface CornerTalkUpcoming {
  text: string;
  messageKey: string;
}

export interface CornerTalkData {
  attention: CornerTalkLine[];
  upcoming: CornerTalkUpcoming[];
  allClear: boolean;
  generatedAt: string;
  /** Daily Ops Brief — deterministic morning street read (read-only counts). */
  brief?: {
    date: string;
    arrivals: number;
    arrivalsMissingFlight: number;
    arrivalsMissingId: number;
    departures: number;
    overnightMessages: number;
    bouncedEmails: number;
    pendingDrafts: number;
    line: string;
  } | null;
}

export function useCornerTalk() {
  const { session, role } = useAuth();
  const { profile } = useProfile();
  const language = profile.data?.preferred_language || "en";

  return useQuery<CornerTalkData>({
    queryKey: ["corner-talk", role, language],
    queryFn: async () => {
      // Use a fresh token — a cached one can expire in flight and 401.
      let { data: { session: freshSession } } = await supabase.auth.getSession();
      if (!freshSession) throw new Error("Not authenticated");
      const expMs = (freshSession.expires_at ?? 0) * 1000;
      if (expMs - Date.now() < 60_000) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        freshSession = refreshed.session ?? freshSession;
      }

      const call = (token: string) =>
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/corner-talk`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ language }),
        });

      let resp = await call(freshSession.access_token);
      if (resp.status === 401) {
        // Stale token — refresh once and retry before giving up.
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed.session) resp = await call(refreshed.session.access_token);
      }

      if (resp.status === 401) return null; // session gone — stay quiet, don't blank the screen
      if (!resp.ok) {
        throw new Error(`Corner Talk error: ${resp.status}`);
      }

      return resp.json();
    },
    enabled: !!session && !!role && role !== "guest",
    staleTime: 3 * 60 * 1000, // 3 minutes — server caches for 2min, so this aligns
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch on every mount, rely on staleTime
    refetchInterval: false, // No automatic polling — only on window focus
    retry: 1,
  });
}
