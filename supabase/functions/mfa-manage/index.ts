// mfa-manage — SECURITY-CRITICAL
// -----------------------------------------------------------------------------
// Server side of admin MFA: recovery ("backup") codes and admin-initiated MFA
// resets. TOTP enrollment/verification itself is handled by Supabase Auth.
//
// LAWS
//  - Recovery codes are shown exactly once, at generation time. Only a
//    PBKDF2-SHA256 hash + random salt is stored in `public.mfa_backup_codes`,
//    which no client role can read.
//  - Codes are single-use: the row is stamped `used_at` inside the same request
//    that accepts it.
//  - Generating codes requires a session that already passed MFA (aal2).
//  - Using a code does NOT sign anyone in and does NOT grant admin access. It
//    removes the lost authenticator factor so the user must re-enroll.
//  - Resetting another user's MFA requires an admin caller at aal2 and a reason.
//  - Codes, hashes and TOTP secrets are never logged or returned in audit rows.
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

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, " +
      "x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Content-Type": "application/json",
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CODE_COUNT = 10;
const CODE_GROUPS = 2;
const GROUP_LEN = 5;
const ITERATIONS = 120_000;
// Unambiguous alphabet (no 0/O, 1/I/L)
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const enc = new TextEncoder();

function randomCode(): string {
  const bytes = new Uint8Array(CODE_GROUPS * GROUP_LEN);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  const groups: string[] = [];
  for (let i = 0; i < CODE_GROUPS; i += 1) {
    groups.push(chars.slice(i * GROUP_LEN, (i + 1) * GROUP_LEN).join(""));
  }
  return groups.join("-");
}

function normalize(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashCode(code: string, saltHex: string): Promise<string> {
  const salt = Uint8Array.from(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(normalize(code)), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    key,
    256
  );
  return toHex(bits);
}

function newSaltHex(): string {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return toHex(salt.buffer);
}

function encodeStored(saltHex: string, hashHex: string): string {
  return `pbkdf2$${ITERATIONS}$${saltHex}$${hashHex}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Assurance level claim from the caller's access token (never trusted for identity). */
function readAal(jwt: string): string | null {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload?.aal === "string" ? payload.aal : null;
  } catch {
    return null;
  }
}

async function logAudit(args: {
  eventType: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  actorId: string | null;
  targetUserId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await admin.rpc("log_staff_audit_event", {
      _event_type: args.eventType,
      _severity: args.severity,
      _actor_id: args.actorId,
      _target_user_id: args.targetUserId ?? null,
      _reason: args.reason ?? null,
      _metadata: (args.metadata ?? {}) as Record<string, unknown>,
    });
  } catch (e) {
    console.error("audit log failed", (e as Error).message);
  }
}

/** Remove every TOTP factor from a user. Returns how many were removed. */
async function removeAllFactors(userId: string): Promise<number> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) throw new Error(error.message);
  const factors = (data?.user as { factors?: Array<{ id: string }> } | null)?.factors ?? [];
  let removed = 0;
  for (const f of factors) {
    const res = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
    if (!res.error) removed += 1;
    else console.error("deleteFactor failed", res.error.message);
  }
  return removed;
}

serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401, headers: cors });
  }

  // Identity is always taken from the Auth server, never from the token body.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const caller = userData?.user ?? null;
  if (userErr || !caller) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401, headers: cors });
  }
  const aal = readAal(jwt);

  let body: { action?: string; code?: string; userId?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400, headers: cors });
  }
  const action = String(body.action ?? "");

  try {
    /* ------------------------------------------------ generate recovery codes */
    if (action === "generate") {
      if (aal !== "aal2") {
        return new Response(
          JSON.stringify({ error: "Verify with your authenticator app before generating recovery codes." }),
          { status: 403, headers: cors }
        );
      }
      const codes = Array.from({ length: CODE_COUNT }, () => randomCode());
      const rows = await Promise.all(
        codes.map(async (c) => {
          const salt = newSaltHex();
          return { user_id: caller.id, code_hash: encodeStored(salt, await hashCode(c, salt)) };
        })
      );
      // Old codes are never valid again once regenerated.
      await admin.from("mfa_backup_codes").delete().eq("user_id", caller.id);
      const { error } = await admin.from("mfa_backup_codes").insert(rows);
      if (error) throw new Error(error.message);

      await logAudit({
        eventType: "mfa_backup_codes_regenerated",
        severity: "high",
        actorId: caller.id,
        targetUserId: caller.id,
        reason: "Recovery codes generated",
        metadata: { count: CODE_COUNT },
      });
      return new Response(JSON.stringify({ codes, count: CODE_COUNT }), { headers: cors });
    }

    /* -------------------------------------------------- use a recovery code */
    if (action === "use_code") {
      const supplied = normalize(String(body.code ?? ""));
      if (supplied.length < 8) {
        return new Response(JSON.stringify({ error: "That doesn't look like a recovery code." }), {
          status: 400,
          headers: cors,
        });
      }
      const { data: rows, error } = await admin
        .from("mfa_backup_codes")
        .select("id, code_hash")
        .eq("user_id", caller.id)
        .is("used_at", null);
      if (error) throw new Error(error.message);

      let matchId: string | null = null;
      for (const row of rows ?? []) {
        const parts = String(row.code_hash).split("$");
        if (parts.length !== 4) continue;
        const [, , saltHex, expected] = parts;
        const candidate = await hashCode(supplied, saltHex);
        if (timingSafeEqual(candidate, expected)) {
          matchId = row.id as string;
          break;
        }
      }

      if (!matchId) {
        await logAudit({
          eventType: "mfa_challenge_failed",
          severity: "medium",
          actorId: caller.id,
          targetUserId: caller.id,
          reason: "Recovery code rejected",
        });
        return new Response(JSON.stringify({ error: "That code isn't valid or was already used." }), {
          status: 403,
          headers: cors,
        });
      }

      await admin.from("mfa_backup_codes").update({ used_at: new Date().toISOString() }).eq("id", matchId);
      const removed = await removeAllFactors(caller.id);

      await logAudit({
        eventType: "mfa_backup_code_used",
        severity: "high",
        actorId: caller.id,
        targetUserId: caller.id,
        reason: "Recovery code accepted — authenticator removed, re-enrollment required",
        metadata: { factors_removed: removed },
      });
      return new Response(JSON.stringify({ ok: true, reenrollRequired: true }), { headers: cors });
    }

    /* --------------------------------------------- admin resets another user */
    if (action === "admin_reset") {
      const targetId = String(body.userId ?? "");
      const reason = String(body.reason ?? "").trim();
      if (!targetId) {
        return new Response(JSON.stringify({ error: "Missing user" }), { status: 400, headers: cors });
      }
      if (reason.length < 5) {
        return new Response(JSON.stringify({ error: "A reason is required (min 5 characters)." }), {
          status: 400,
          headers: cors,
        });
      }
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admins only." }), { status: 403, headers: cors });
      }
      if (aal !== "aal2" && targetId !== caller.id) {
        return new Response(
          JSON.stringify({ error: "Verify with your own authenticator before resetting someone else's MFA." }),
          { status: 403, headers: cors }
        );
      }

      const removed = await removeAllFactors(targetId);
      await admin.from("mfa_backup_codes").delete().eq("user_id", targetId);

      await logAudit({
        eventType: "mfa_reset_by_admin",
        severity: "critical",
        actorId: caller.id,
        targetUserId: targetId,
        reason,
        metadata: { factors_removed: removed, actor_email: caller.email ?? null },
      });
      return new Response(JSON.stringify({ ok: true, factorsRemoved: removed }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: cors });
  } catch (e) {
    console.error("mfa-manage error", (e as Error).message);
    return new Response(JSON.stringify({ error: "Something went wrong. Try again." }), {
      status: 500,
      headers: cors,
    });
  }
});
