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
    (onResetRoute &&
      (!!get("code") || !!get("token_hash") || !!get("token") || !!get("access_token") || hasError));

  if (!isRecovery) return;

  const payload: RecoveryPayload = {
    access_token: get("access_token") ?? undefined,
    refresh_token: get("refresh_token") ?? undefined,
    code: get("code") ?? undefined,
    token_hash: get("token_hash") ?? get("token") ?? undefined,
    error: get("error_code") ?? get("error") ?? undefined,
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

/**
 * The single source of truth for the `redirectTo` we hand Supabase when asking
 * for a reset email. Every reset link Supabase mails out is built on top of
 * this URL, so it must always be the same-origin /reset-password route with no
 * query string, hash, or trailing slash.
 */
export function recoveryRedirectTo(origin: string = window.location.origin): string {
  return `${origin.replace(/\/+$/, "")}/reset-password`;
}

export type RecoveryLinkKind = "hash" | "pkce" | "token_hash" | "error";

/**
 * Builds the reset URLs in the exact shapes Supabase delivers them, on top of
 * `recoveryRedirectTo()`. Used to document and test the link contract that
 * `captureRecoveryLink()` must be able to parse.
 */
export function buildRecoveryLink(
  kind: RecoveryLinkKind,
  params: Record<string, string> = {},
  origin: string = window.location.origin,
): string {
  const base = recoveryRedirectTo(origin);

  if (kind === "hash") {
    const hash = new URLSearchParams({
      access_token: params.access_token ?? "",
      refresh_token: params.refresh_token ?? "",
      token_type: "bearer",
      type: "recovery",
    });
    return `${base}#${hash.toString()}`;
  }

  if (kind === "pkce") {
    return `${base}?${new URLSearchParams({ code: params.code ?? "" }).toString()}`;
  }

  if (kind === "token_hash") {
    return `${base}?${new URLSearchParams({
      token_hash: params.token_hash ?? "",
      type: "recovery",
    }).toString()}`;
  }

  return `${base}#${new URLSearchParams({
    error: params.error ?? "access_denied",
    error_code: params.error_code ?? "otp_expired",
    error_description: params.error_description ?? "Email link is invalid or has expired",
  }).toString()}`;
}


// Side effect on import: runs before the Supabase client module is evaluated
// (as long as this module is imported first in main.tsx).
captureRecoveryLink();
