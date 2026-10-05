import { supabase } from "@/integrations/supabase/client";

/**
 * Calls the admin-only payment-diagnostics function.
 * A stale access token (tab regained focus, token mid-refresh) comes back 401;
 * we refresh the session once and retry. Returns null when there is still no
 * valid session (or the user isn't admin/manager) instead of throwing.
 */
export async function fetchPaymentDiagnostics<T = any>(): Promise<T | null> {
  const call = async (token: string) =>
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payment-diagnostics`, {
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
    if (!refreshed.session) return null;
    resp = await call(refreshed.session.access_token);
  }
  if (resp.status === 401 || resp.status === 403) return null;

  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(body.error || "Failed to load diagnostics");
  return body as T;
}
