// send-push
// -----------------------------------------------------------------------------
import { emitAdminAlert } from "../_shared/adminAlert.ts";
// BUSINESS-CRITICAL — Web Push (RFC 8030 / 8291 / 8292).
//
// Delivers OS-level notifications to staff and guests who subscribed from the
// installed PWA. Payloads are encrypted with aes128gcm (RFC 8291) — push
// services (FCM, Mozilla, Apple) REJECT unencrypted payload bodies, which is
// why earlier plaintext delivery silently failed.
//
// Every attempt is written to `push_delivery_log` so admins can see, in plain
// English, whether Nikki's phone actually received an alert.
//
// Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (fallback: policy_settings row).
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://lmtcampstay.com",
  "https://lmtcampstay.com",
  "https://www.lmtcampstay.com",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9.-]+\.lovable\.app$/.test(origin)) return true;
  return false;
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

// --- base64url helpers -------------------------------------------------------

function b64uDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function b64uEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

// --- VAPID (RFC 8292) --------------------------------------------------------

async function importVapidSigningKey(publicKeyB64: string, privateKeyB64: string) {
  const pub = b64uDecode(publicKeyB64);
  const priv = b64uDecode(privateKeyB64);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: b64uEncode(pub.slice(1, 33)),
    y: b64uEncode(pub.slice(33, 65)),
    d: b64uEncode(priv),
  };
  return await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
}

async function vapidAuthHeader(
  endpoint: string,
  publicKeyB64: string,
  privateKeyB64: string,
  subject: string,
): Promise<string> {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;

  const headerB64 = b64uEncode(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payloadB64 = b64uEncode(utf8(JSON.stringify({ aud, exp, sub: subject })));
  const unsigned = `${headerB64}.${payloadB64}`;

  const key = await importVapidSigningKey(publicKeyB64, privateKeyB64);
  // WebCrypto ECDSA returns raw r||s (64 bytes) — exactly what JWS ES256 wants.
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(unsigned)),
  );

  const jwt = `${unsigned}.${b64uEncode(sig)}`;
  return `vapid t=${jwt}, k=${publicKeyB64}`;
}

// --- Payload encryption (RFC 8291, aes128gcm) --------------------------------

async function hmac(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}

/** HKDF with a single-block expand (all outputs here are <= 32 bytes). */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, length);
}

async function encryptPayload(
  payload: string,
  uaPublicB64: string,
  authSecretB64: string,
): Promise<Uint8Array> {
  const uaPublic = b64uDecode(uaPublicB64);
  const authSecret = b64uDecode(authSecretB64);

  // Ephemeral application-server ECDH keypair
  const asKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));

  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256),
  );

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" || ua_public || as_public, 32)
  const keyInfo = concat(utf8("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  // Single record: plaintext followed by the 0x02 (last record) delimiter.
  const plaintext = concat(utf8(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, plaintext),
  );

  // Header: salt(16) | rs(4, big-endian) | idlen(1) | as_public(65)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

// --- Delivery ----------------------------------------------------------------

interface DeliveryResult {
  ok: boolean;
  status: number;
  error?: string;
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  subject: string,
): Promise<DeliveryResult> {
  try {
    const body = await encryptPayload(payload, subscription.p256dh, subscription.auth);

    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Urgency: "high",
    };

    if (vapidPublicKey && vapidPrivateKey) {
      headers["Authorization"] = await vapidAuthHeader(
        subscription.endpoint,
        vapidPublicKey,
        vapidPrivateKey,
        subject,
      );
    }

    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers,
      body: body as unknown as BodyInit,
    });

    if (res.ok) return { ok: true, status: res.status };

    const text = await res.text().catch(() => "");
    console.error(`[send-push] ${res.status} from push service: ${text.slice(0, 200)}`);
    return { ok: false, status: res.status, error: text.slice(0, 300) || `HTTP ${res.status}` };
  } catch (err) {
    console.error("[send-push] Delivery failed:", err);
    return { ok: false, status: 0, error: String((err as Error)?.message ?? err).slice(0, 300) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const reqBody = await req.json();

    // Non-secret key-shape diagnostic: never returns key material, only
    // whether the configured VAPID pair decodes to the expected byte lengths.
    if (reqBody?.diagnostic === true) {
      const pub = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
      const priv = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
      const shape = (v: string) => {
        try {
          return { chars: v.length, bytes: b64uDecode(v).length, decodes: true };
        } catch (e) {
          return { chars: v.length, decodes: false, error: String((e as Error).message) };
        }
      };
      // Phones subscribe with the public key saved in policy_settings; if it
      // differs from the server's signing pair, every delivery is rejected.
      const { data: savedRow } = await supabase
        .from("policy_settings")
        .select("value")
        .eq("key", "vapid_public_key")
        .maybeSingle();
      const savedRaw = savedRow?.value;
      const saved = typeof savedRaw === "string"
        ? savedRaw.replace(/^"|"$/g, "")
        : (savedRaw as any)?.key ?? "";
      return json({
        public_key: shape(pub),
        private_key: shape(priv),
        saved_public_key_matches_server: saved.length > 0 && saved === pub,
      });
    }

    const { user_ids, title, body, data, source } = reqBody;

    if (!user_ids || !Array.isArray(user_ids) || !title || !body) {
      return json({ error: "user_ids (array), title, and body are required" }, 400);
    }

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", user_ids);

    if (error) throw error;
    if (!subs || subs.length === 0) {
      return json({ sent: 0, failed: 0, total: 0, message: "No push subscriptions for these users" });
    }

    // VAPID keys — env secrets first, DB fallback for the public half.
    let vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

    if (!vapidPublicKey) {
      const { data: row } = await supabase
        .from("policy_settings")
        .select("value")
        .eq("key", "vapid_public_key")
        .maybeSingle();
      vapidPublicKey = row?.value
        ? typeof row.value === "string"
          ? row.value.replace(/^"|"$/g, "")
          : ((row.value as Record<string, string>).key ?? "")
        : "";
    }

    if (!vapidPublicKey || !vapidPrivateKey) {
      return json({ error: "VAPID keys are not configured on the server" }, 500);
    }

    const subject = "mailto:info@lmtcampstay.com";
    const payload = JSON.stringify({ title, body, ...(data ?? {}) });

    let sent = 0;
    const failures: Array<{ endpoint: string; status: number; error?: string }> = [];
    const logRows: Record<string, unknown>[] = [];

    for (const sub of subs) {
      const result = await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
        vapidPublicKey,
        vapidPrivateKey,
        subject,
      );

      logRows.push({
        user_id: sub.user_id,
        endpoint_tail: String(sub.endpoint).slice(-24),
        title,
        status: result.ok ? "delivered" : "failed",
        http_status: result.status || null,
        error: result.error ?? null,
        source: source ?? "system",
      });

      if (result.ok) {
        sent++;
        await supabase
          .from("push_subscriptions")
          .update({ last_success_at: new Date().toISOString(), last_error: null, failure_count: 0 })
          .eq("id", sub.id);
      } else {
        failures.push({ endpoint: sub.endpoint, status: result.status, error: result.error });
        // Only prune subscriptions the push service says are gone. Transient
        // errors (429/500/network) must NOT delete a working device.
        if (result.status === 404 || result.status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          await supabase
            .from("push_subscriptions")
            .update({
              last_error: result.error ?? `HTTP ${result.status}`,
              failure_count: (sub.failure_count ?? 0) + 1,
            })
            .eq("id", sub.id);
        }
      }
    }

    if (logRows.length > 0) {
      await supabase.from("push_delivery_log").insert(logRows);
    }

    // Admin alert: phone alerts went nowhere. Never alert on the alert lane
    // itself, or a broken push service would loop.
    if (sent === 0 && failures.length > 0 && source !== "admin-alert") {
      await emitAdminAlert(
        "push_failure",
        `Phone alerts failed for all ${failures.length} device(s): ${failures[0]?.error ?? `HTTP ${failures[0]?.status}`}`,
        { deepLink: "/monitoring", context: { attempted: subs.length, first_status: failures[0]?.status, source: source ?? "system" } },
      );
    }

    return json({ sent, failed: failures.length, total: subs.length, failures });
  } catch (err) {
    console.error("[send-push] Error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
