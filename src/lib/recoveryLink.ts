/**
 * Password-recovery link capture.
 *
 * MUST be imported before the Supabase client (i.e. before ./App) so we can read
 * the URL fragment before supabase-js consumes and strips it.
 *
 * Supabase can hand us a recovery link in three shapes depending on flow/version:
 *   1. implicit  -> #access_token=...&refresh_token=...&type=recovery
 *   2. pkce      -> ?code=...
 *   3. token_hash-> ?token_hash=...&type=recovery
 * plus an error shape: #error=access_denied&error_code=otp_expired
 *
 * We stash whatever we find in sessionStorage and force the URL to /reset-password
 * so route guards can't bounce the user to the dashboard mid-reset.
 */
export type RecoveryPayload = {
  access_token?: string;
  refresh_token?: string;
  code?: string;
  token_hash?: string;
  error?: string;
  error_description?: string;
};

const KEY = "lmt_recovery_payload";

function readParams(): { hash: URLSearchParams; search: URLSearchParams } {
  return {
    hash: new URLSearchParams(window.location.hash.replace(/^#/, "")),
    search: new URLSearchParams(window.location.search),
  };
}

export function captureRecoveryLink(): void {
  if (typeof window === "undefined") return;
  const { hash, search } = readParams();
  const get = (k: string) => hash.get(k) ?? search.get(k);

  const type = get("type");
  const onResetRoute = window.location.pathname === "/reset-password";
  const hasError = !!get("error") || !!get("error_code");

  const isRecovery =
    type === "recovery" ||
    (onResetRoute && (!!get("code") || !!get("token_hash") || !!get("access_token") || hasError));

  if (!isRecovery) return;

  const payload: RecoveryPayload = {
    access_token: get("access_token") ?? undefined,
    refresh_token: get("refresh_token") ?? undefined,
    code: get("code") ?? undefined,
    token_hash: get("token_hash") ?? get("token") ?? undefined,
    error: get("error") ?? get("error_code") ?? undefined,
    error_description: get("error_description") ?? undefined,
  };

  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* private mode — page-level handling still works from the URL */
  }

  // Strip credentials from the visible URL and pin the user on the reset page.
  window.history.replaceState(null, "", "/reset-password");
}

export function consumeRecoveryPayload(): RecoveryPayload | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as RecoveryPayload;
  } catch {
    return null;
  }
}

// Side effect on import: runs before the Supabase client module is evaluated
// (as long as this module is imported first in main.tsx).
captureRecoveryLink();
