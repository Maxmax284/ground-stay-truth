import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BotIdentity = {
  telegram: { configured: boolean; username: string | null; error?: string };
  whatsapp: { configured: boolean; number: string | null };
};

export function useBotIdentity() {
  return useQuery<BotIdentity | null>({
    queryKey: ["bot-identity"],
    queryFn: async () => {
      const call = (token: string) =>
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bot-identity`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      let resp = await call(session.access_token);
      if (resp.status === 401) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (!refreshed.session) return null; // signed out — stay quiet
        resp = await call(refreshed.session.access_token);
        if (resp.status === 401) return null;
      }
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load bot identity");
      }
      return resp.json();
    },
    staleTime: 60_000,
    retry: false,
    throwOnError: false,
  });
}

/** Mints a fresh link code, then returns the deep link URL for the chosen channel. */
export async function buildConnectUrl(
  channel: "telegram" | "whatsapp",
  identity: BotIdentity,
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");

  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/messaging-link`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: "{}",
    }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || "Failed to generate link code");
  }
  const { code } = await resp.json();

  if (channel === "telegram") {
    if (!identity.telegram.username) throw new Error("Telegram bot not configured");
    return `https://t.me/${identity.telegram.username}?start=link_${code}`;
  }
  if (!identity.whatsapp.number) throw new Error("WhatsApp not configured");
  return `https://wa.me/${identity.whatsapp.number}?text=${encodeURIComponent(`/link ${code}`)}`;
}
