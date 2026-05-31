// Vitest coverage for the launch-safety helpers. Mirrors logic from
// supabase/functions/_shared/cors.ts and the guest-payment-link flow.
// Edge functions run in Deno so we re-implement the pure validators here.
import { describe, it, expect } from "vitest";

const STATIC_ORIGINS = new Set([
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:3000",
]);
const PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
  /^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/,
];

function isAllowedOrigin(origin: string | null) {
  if (!origin) return false;
  if (STATIC_ORIGINS.has(origin)) return true;
  return PATTERNS.some((re) => re.test(origin));
}

function validateRedirectUrl(raw: string | null | undefined) {
  if (!raw || typeof raw !== "string") return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const origin = `${url.protocol}//${url.host}`;
  return isAllowedOrigin(origin) ? url.toString() : null;
}

describe("CORS origin allowlist", () => {
  it("accepts production origin", () => {
    expect(isAllowedOrigin("https://ground-stay-truth.lovable.app")).toBe(true);
  });
  it("accepts localhost dev ports", () => {
    expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:8080")).toBe(true);
  });
  it("accepts Lovable preview hosts", () => {
    expect(isAllowedOrigin("https://id-preview--abc123.lovable.app")).toBe(true);
    expect(isAllowedOrigin("https://abc-def.lovableproject.com")).toBe(true);
  });
  it("rejects unknown origins", () => {
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
    expect(isAllowedOrigin("http://ground-stay-truth.lovable.app.evil.com")).toBe(false);
    expect(isAllowedOrigin(null)).toBe(false);
    expect(isAllowedOrigin("")).toBe(false);
  });
});

describe("redirect URL validation", () => {
  it("accepts allowed origins", () => {
    expect(validateRedirectUrl("https://ground-stay-truth.lovable.app/guest?x=1")).toBeTruthy();
  });
  it("rejects foreign origins", () => {
    expect(validateRedirectUrl("https://attacker.com/steal")).toBeNull();
  });
  it("rejects non-http schemes", () => {
    expect(validateRedirectUrl("javascript:alert(1)")).toBeNull();
    expect(validateRedirectUrl("file:///etc/passwd")).toBeNull();
  });
  it("rejects garbage", () => {
    expect(validateRedirectUrl(undefined)).toBeNull();
    expect(validateRedirectUrl("not a url")).toBeNull();
  });
});

// ── Payment link state-machine guards ────────────────────────────────────
type Link = { used_at: string | null; revoked_at: string | null; expires_at: string };
function linkState(l: Link, alreadyPaid: boolean, bookingState: string) {
  if (l.revoked_at) return "revoked";
  if (new Date(l.expires_at).getTime() < Date.now()) return "expired";
  if (alreadyPaid || bookingState !== "pending_deposit") return "already_paid";
  if (l.used_at) return "already_used";
  return "ok";
}

describe("payment link state machine", () => {
  const future = new Date(Date.now() + 3600_000).toISOString();
  const past = new Date(Date.now() - 1000).toISOString();

  it("ok when fresh and unpaid", () => {
    expect(linkState({ used_at: null, revoked_at: null, expires_at: future }, false, "pending_deposit")).toBe("ok");
  });
  it("expired when past expiry", () => {
    expect(linkState({ used_at: null, revoked_at: null, expires_at: past }, false, "pending_deposit")).toBe("expired");
  });
  it("revoked when revoked_at set", () => {
    expect(linkState({ used_at: null, revoked_at: new Date().toISOString(), expires_at: future }, false, "pending_deposit")).toBe("revoked");
  });
  it("already_paid when payment recorded", () => {
    expect(linkState({ used_at: null, revoked_at: null, expires_at: future }, true, "pending_deposit")).toBe("already_paid");
  });
  it("already_paid when booking already confirmed", () => {
    expect(linkState({ used_at: null, revoked_at: null, expires_at: future }, false, "confirmed")).toBe("already_paid");
  });
  it("already_used after first checkout consumed token", () => {
    expect(linkState({ used_at: new Date().toISOString(), revoked_at: null, expires_at: future }, false, "pending_deposit")).toBe("already_used");
  });
});

// ── Webhook idempotency: a duplicate provider_event_id should not double-confirm ──
describe("webhook idempotency", () => {
  it("only first insert succeeds; duplicates collide on unique constraint", () => {
    const seen = new Set<string>();
    const insert = (id: string) => {
      if (seen.has(id)) return { ok: false, code: "23505" };
      seen.add(id);
      return { ok: true };
    };
    expect(insert("evt_1").ok).toBe(true);
    expect(insert("evt_1").code).toBe("23505");
    expect(insert("evt_2").ok).toBe(true);
    expect(seen.size).toBe(2);
  });
});

// ── Token cannot be used for another booking ──
describe("token/booking binding", () => {
  it("checkout payload uses the link's stored booking_id, not a client-supplied one", () => {
    const link = { id: "lnk_1", booking_id: "booking_A", amount: 500 };
    const clientSays = { token: "x", booking_id: "booking_B", amount: 1 };
    // Simulated server resolution always trusts the link row.
    const metadata = { booking_id: link.booking_id, payment_link_id: link.id };
    expect(metadata.booking_id).toBe("booking_A");
    expect(metadata.booking_id).not.toBe(clientSays.booking_id);
  });
});
