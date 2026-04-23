import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SECRET_KEYS = [
  "stripe_secret_key",
  "stripe_publishable_key",
  "stripe_webhook_secret",
  "resend_api_key",
  "fenrir_api_key",
  "fenrir_receive_token",
  "telegram_bot_token",
  "twilio_account_sid",
  "twilio_auth_token",
  "twilio_sms_from",
  "twilio_whatsapp_from",
  "line_channel_access_token",
  "line_channel_secret",
  "messaging_bridge_internal_token",
] as const;

type SecretKey = (typeof SECRET_KEYS)[number];
type SecretStatus = Record<string, { configured: boolean; updated_at: string | null }>;

async function callSecretFunction(action: string, key?: string, value?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-integration-secret`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ action, key, value }),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }

  return resp.json();
}

export function useSecretStatuses() {
  return useQuery<SecretStatus>({
    queryKey: ["integration-secret-status"],
    queryFn: () => callSecretFunction("check_all", "stripe_secret_key"), // key is ignored for check_all
    staleTime: 30_000,
  });
}

export function useSetSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      callSecretFunction("set", key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integration-secret-status"] });
    },
  });
}

export function useDeleteSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => callSecretFunction("delete", key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integration-secret-status"] });
    },
  });
}
