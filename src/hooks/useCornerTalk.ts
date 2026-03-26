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
}

export function useCornerTalk() {
  const { session, role } = useAuth();
  const { profile } = useProfile();
  const language = profile.data?.preferred_language || "en";

  return useQuery<CornerTalkData>({
    queryKey: ["corner-talk", role, language],
    queryFn: async () => {
      if (!session) throw new Error("Not authenticated");

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/corner-talk`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ language }),
        }
      );

      if (!resp.ok) {
        throw new Error(`Corner Talk error: ${resp.status}`);
      }

      return resp.json();
    },
    enabled: !!session && !!role && role !== "guest",
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: 1,
  });
}
