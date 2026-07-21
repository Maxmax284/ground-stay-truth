// Shared CORS + redirect-URL validation for payment-critical functions.
//
// Behavior:
// - Reads SITE_URL secret as the canonical production origin.
// - Permits explicit allowlist (production + local dev) and Lovable preview hosts.
// - Echoes the request Origin only when it matches the allowlist; otherwise the
//   response has no Access-Control-Allow-Origin header at all, so browsers
//   refuse the response (fail-closed, not silently wildcarded).
// - validateRedirectUrl() rejects success_url / cancel_url that don't match an
//   allowed origin. Used by process-payment + guest-payment-link.

const SITE_URL = (Deno.env.get("SITE_URL") || "").trim();
export const SITE_URL_CONFIGURED = SITE_URL.length > 0;

// Production fallbacks. SITE_URL takes precedence when set.
const STATIC_ORIGINS = new Set<string>([
  "https://ground-stay-truth.lovable.app",
  "https://lmtcampstay.com",
  "https://www.lmtcampstay.com",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:3000",
]);
if (SITE_URL_CONFIGURED) STATIC_ORIGINS.add(SITE_URL);

const LOVABLE_PREVIEW_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
  /^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/,
];

const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, stripe-signature, " +
  "x-supabase-client-platform, x-supabase-client-platform-version, " +
  "x-supabase-client-runtime, x-supabase-client-runtime-version";

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  if (STATIC_ORIGINS.has(origin)) return true;
  return LOVABLE_PREVIEW_PATTERNS.some((re) => re.test(origin));
}

/**
 * Build CORS headers for a response. Fail-closed: when the origin is not
 * allowed we omit Access-Control-Allow-Origin entirely. Browsers will then
 * block the response, which is exactly what we want — no silent wildcard.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    Vary: "Origin",
  };
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else if (!origin && SITE_URL_CONFIGURED) {
    // Non-browser caller (curl, Stripe webhook). Still set canonical origin
    // for any downstream tooling that inspects it. Stripe ignores CORS.
    headers["Access-Control-Allow-Origin"] = SITE_URL;
  }
  return headers;
}

export function corsPreflight(req: Request): Response {
  return new Response(null, { status: 204, headers: getCorsHeaders(req) });
}

export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

/**
 * Validate a guest-supplied success_url / cancel_url against the allowlist.
 * Returns the normalized URL on success or null on failure.
 */
export function validateRedirectUrl(rawUrl: string | undefined | null): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const origin = `${url.protocol}//${url.host}`;
  if (!isAllowedOrigin(origin)) return null;
  return url.toString();
}

/**
 * Resolve the canonical public site URL for building outbound links
 * (payment links sent to guests, redirect fallbacks, etc.).
 */
export function getCanonicalSiteUrl(): string {
  return SITE_URL_CONFIGURED ? SITE_URL : "https://ground-stay-truth.lovable.app";
}

/**
 * Admin-facing config warnings. Surface via /functions/v1/<fn> response so
 * admins know SITE_URL needs to be configured before going live.
 */
export function configWarnings(): string[] {
  const warnings: string[] = [];
  if (!SITE_URL_CONFIGURED) {
    warnings.push(
      "SITE_URL secret is not configured. Payment links and CORS will use the default Lovable URL. Set SITE_URL in integration secrets before launch.",
    );
  }
  return warnings;
}
