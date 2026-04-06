/**
 * Centralized error logging utility.
 * Logs failures to recovery_audit_log for observability.
 */
import { supabase } from "@/integrations/supabase/client";

interface ErrorLogParams {
  action: string;
  category?: string;
  details?: Record<string, unknown>;
  failureReason: string;
}

/**
 * Log a client-side failure to the recovery_audit_log table.
 * Fire-and-forget — never throws.
 */
export async function logClientError({
  action,
  category = "client_error",
  details = {},
  failureReason,
}: ErrorLogParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("recovery_audit_log").insert({
      action: `[CLIENT] ${action}`,
      category,
      outcome: "failure",
      failure_reason: failureReason.slice(0, 500),
      details: { ...details, url: window.location.pathname },
      user_id: user?.id ?? null,
      user_role: null,
    });
  } catch {
    // Silent — logging itself must never crash the app
    console.error("[logClientError] Failed to log:", action, failureReason);
  }
}

/**
 * Wraps a fetch call with structured error handling.
 * Returns { data, error } pattern.
 */
export async function safeFetch<T = unknown>(
  url: string,
  options?: RequestInit,
  context?: string
): Promise<{ data: T | null; error: string | null }> {
  try {
    const resp = await fetch(url, options);
    if (!resp.ok) {
      const body = await resp.text();
      let message: string;
      try {
        const parsed = JSON.parse(body);
        message = parsed.error || parsed.message || `HTTP ${resp.status}`;
      } catch {
        message = `HTTP ${resp.status}: ${body.slice(0, 200)}`;
      }
      // Log to audit
      await logClientError({
        action: context || `fetch:${new URL(url).pathname}`,
        failureReason: message,
        details: { status: resp.status, url },
      });
      return { data: null, error: message };
    }
    const data = await resp.json();
    return { data, error: null };
  } catch (err: any) {
    const message = err?.message || "Network error";
    await logClientError({
      action: context || `fetch:${url}`,
      category: "network_error",
      failureReason: message,
      details: { url },
    });
    return { data: null, error: message };
  }
}
