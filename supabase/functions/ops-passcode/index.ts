// ops-passcode — BUSINESS-CRITICAL
// -----------------------------------------------------------------------------
// The security-code gate in front of the AI ops layer (Deep ops chat, AI draft
// approvals, break-glass elevation grants).
//
// LAWS
//  - The passcode is never stored or returned in plaintext. Only a PBKDF2-SHA256
//    hash + random salt live in `ops_passcode`, which no client role can read.
//  - Verification happens here, server-side. The client never compares codes.
//  - An unlock creates a row in `ops_unlock_sessions` with a hashed token.
//    Hybrid TTL: 15 minutes idle (extended by `touch`) AND tab-scoped — the
//    client keeps the token in sessionStorage, so a new tab has no token and its
//    `status` call revokes the orphaned session.
//  - 5 failed attempts inside 15 minutes locks that account out for 15 minutes
//    and fires an admin alert.
//  - Every attempt (pass or fail) is logged in `ops_unlock_attempts`.
//  - Everyone is gated, admins included. If no passcode is configured yet the
//    gate is open, so the platform can never lock itself out.
// -----------------------------------------------------------------------------
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://lmtcampstay.com",
  "https://ground-stay-truth.lovable.app",
  "https://lmtcampstay.com",
  "https://www.lmtcampstay.com",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  return false;
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const IDLE_MINUTES = 15;
const MAX_FAILS = 5;
const LOCKOUT_MINUTES = 15;
const MIN_CODE_LENGTH = 6;
const ITERATIONS = 120_000;

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashCode(code: string, salt: string, iterations = ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations },
    key,
    256,
  );
  return toHex(bits);
}

async function sha256(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}

/** Constant-time-ish comparison of two hex strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

interface PasscodeRow {
  salt: string;
  hash: string;
  iterations: number;
  updated_at: string;
  updated_by_user_id: string | null;
}

async function loadPasscode(): Promise<PasscodeRow | null> {
  const { data } = await admin
    .from("ops_passcode")
    .select("salt, hash, iterations, updated_at, updated_by_user_id")
    .eq("id", true)
    .maybeSingle();
  return (data as PasscodeRow) ?? null;
}

async function activeSession(userId: string) {
  const { data } = await admin
    .from("ops_unlock_sessions")
    .select("id, token_hash, expires_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; token_hash: string; expires_at: string } | null) ?? null;
}

async function revokeSessions(userId: string) {
  await admin
    .from("ops_unlock_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
}

/** How long this account is locked out for, or null when it is not. */
async function lockoutUntil(userId: string): Promise<string | null> {
  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60_000).toISOString();
  const { data } = await admin
    .from("ops_unlock_attempts")
    .select("created_at, succeeded")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = (data ?? []) as Array<{ created_at: string; succeeded: boolean }>;
  const fails: string[] = [];
  for (const row of rows) {
    if (row.succeeded) break; // a success clears the streak
    fails.push(row.created_at);
  }
  if (fails.length < MAX_FAILS) return null;
  return new Date(new Date(fails[0]).getTime() + LOCKOUT_MINUTES * 60_000).toISOString();
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const jwt = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(jwt);
    if (claimsError || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const { data: canRead } = await admin.rpc("has_ops_read", { _user_id: userId });
    if (!canRead) return json({ error: "Staff access required" }, 403);

    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "status");
    const token = typeof body.token === "string" ? body.token : "";
    const configuredRow = await loadPasscode();
    const configured = !!configuredRow;

    switch (action) {
      // ── Where do I stand? ─────────────────────────────────────────────────
      case "status": {
        if (!configured) {
          return json({ configured: false, unlocked: true, gate_open: true });
        }
        const session = await activeSession(userId);
        if (session && token && safeEqual(session.token_hash, await sha256(token))) {
          return json({
            configured: true,
            unlocked: true,
            gate_open: false,
            expires_at: session.expires_at,
            locked_out_until: null,
            updated_at: configuredRow!.updated_at,
          });
        }
        // A live session with no matching token means a stale window (new tab,
        // reload without the token). Close it: unlock is tab-scoped.
        if (session) await revokeSessions(userId);
        return json({
          configured: true,
          unlocked: false,
          gate_open: false,
          expires_at: null,
          locked_out_until: await lockoutUntil(userId),
          updated_at: configuredRow!.updated_at,
        });
      }

      // ── Enter the code ────────────────────────────────────────────────────
      case "unlock": {
        if (!configured) return json({ configured: false, unlocked: true, gate_open: true });

        const lockedUntil = await lockoutUntil(userId);
        if (lockedUntil) {
          return json({ error: "locked_out", locked_out_until: lockedUntil }, 429);
        }

        const code = String(body.code ?? "");
        const computed = await hashCode(code, configuredRow!.salt, configuredRow!.iterations);
        const ok = safeEqual(computed, configuredRow!.hash);

        await admin.from("ops_unlock_attempts").insert({
          user_id: userId,
          succeeded: ok,
          reason: ok ? "unlock" : "wrong_code",
        });

        if (!ok) {
          const nowLocked = await lockoutUntil(userId);
          if (nowLocked) {
            await admin.rpc("emit_admin_alert", {
              _event_type: "ops_passcode_lockout",
              _message: "AI ops passcode locked out after repeated wrong codes",
              _reference_id: null,
              _deep_link: "/settings?tab=ai-ops",
              _context: { user_id: userId, locked_out_until: nowLocked },
            });
          }
          return json({ error: "wrong_code", locked_out_until: nowLocked }, 401);
        }

        await revokeSessions(userId);
        const newToken = randomToken();
        const expiresAt = new Date(Date.now() + IDLE_MINUTES * 60_000).toISOString();
        const { error } = await admin.from("ops_unlock_sessions").insert({
          user_id: userId,
          token_hash: await sha256(newToken),
          expires_at: expiresAt,
        });
        if (error) {
          console.error("ops-passcode session insert failed", error);
          return json({ error: "Could not open unlock session" }, 500);
        }
        return json({ configured: true, unlocked: true, token: newToken, expires_at: expiresAt });
      }

      // ── Keep the window alive while in use ────────────────────────────────
      case "touch": {
        if (!configured) return json({ configured: false, unlocked: true, gate_open: true });
        const session = await activeSession(userId);
        if (!session || !token || !safeEqual(session.token_hash, await sha256(token))) {
          if (session) await revokeSessions(userId);
          return json({ configured: true, unlocked: false }, 200);
        }
        const expiresAt = new Date(Date.now() + IDLE_MINUTES * 60_000).toISOString();
        await admin
          .from("ops_unlock_sessions")
          .update({ expires_at: expiresAt, last_used_at: new Date().toISOString() })
          .eq("id", session.id);
        return json({ configured: true, unlocked: true, expires_at: expiresAt });
      }

      // ── Lock it back up ───────────────────────────────────────────────────
      case "lock": {
        await revokeSessions(userId);
        return json({ configured, unlocked: false, locked: true });
      }

      // ── Admin: set / rotate the code ──────────────────────────────────────
      case "set": {
        if (!isAdmin) return json({ error: "Admins only" }, 403);
        const code = String(body.code ?? "").trim();
        if (code.length < MIN_CODE_LENGTH) {
          return json({ error: `Code must be at least ${MIN_CODE_LENGTH} characters` }, 400);
        }
        if (configured) {
          // Rotating requires proving you know the current code.
          const current = String(body.current_code ?? "");
          const computed = await hashCode(current, configuredRow!.salt, configuredRow!.iterations);
          if (!safeEqual(computed, configuredRow!.hash)) {
            await admin
              .from("ops_unlock_attempts")
              .insert({ user_id: userId, succeeded: false, reason: "rotate_wrong_current" });
            return json({ error: "wrong_current_code" }, 401);
          }
        }
        const salt = randomToken();
        const hash = await hashCode(code, salt);
        const { error } = await admin.from("ops_passcode").upsert(
          {
            id: true,
            salt,
            hash,
            iterations: ITERATIONS,
            updated_by_user_id: userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
        if (error) {
          console.error("ops-passcode set failed", error);
          return json({ error: "Could not save the code" }, 500);
        }
        // Rotating the code invalidates every open window, everywhere.
        await admin
          .from("ops_unlock_sessions")
          .update({ revoked_at: new Date().toISOString() })
          .is("revoked_at", null);
        await admin.rpc("emit_admin_alert", {
          _event_type: "ops_passcode_changed",
          _message: configured ? "AI ops passcode rotated" : "AI ops passcode set",
          _reference_id: null,
          _deep_link: "/settings?tab=ai-ops",
          _context: { by_user_id: userId },
        });
        return json({ configured: true, unlocked: false, saved: true });
      }

      // ── Admin: remove the gate entirely ───────────────────────────────────
      case "clear": {
        if (!isAdmin) return json({ error: "Admins only" }, 403);
        if (!configured) return json({ configured: false, cleared: true });
        const current = String(body.current_code ?? "");
        const computed = await hashCode(current, configuredRow!.salt, configuredRow!.iterations);
        if (!safeEqual(computed, configuredRow!.hash)) {
          return json({ error: "wrong_current_code" }, 401);
        }
        await admin.from("ops_passcode").delete().eq("id", true);
        await admin
          .from("ops_unlock_sessions")
          .update({ revoked_at: new Date().toISOString() })
          .is("revoked_at", null);
        await admin.rpc("emit_admin_alert", {
          _event_type: "ops_passcode_cleared",
          _message: "AI ops passcode removed — Deep ops is open to all ops staff",
          _reference_id: null,
          _deep_link: "/settings?tab=ai-ops",
          _context: { by_user_id: userId },
        });
        return json({ configured: false, cleared: true, gate_open: true });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("ops-passcode failure", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
