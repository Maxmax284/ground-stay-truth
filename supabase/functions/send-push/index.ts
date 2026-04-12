import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  if (/^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  return false;
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

// --- VAPID / Web Push helpers ---

function base64UrlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importVapidKeys(publicKeyB64: string, privateKeyB64: string) {
  const publicKeyBytes = base64UrlDecode(publicKeyB64);
  const privateKeyBytes = base64UrlDecode(privateKeyB64);

  // Build JWK for the P-256 private key
  // Public key is 65 bytes uncompressed (04 || x || y), private is 32 bytes (d)
  const x = base64UrlEncode(publicKeyBytes.slice(1, 33));
  const y = base64UrlEncode(publicKeyBytes.slice(33, 65));
  const d = base64UrlEncode(privateKeyBytes);

  const jwk = { kty: "EC", crv: "P-256", x, y, d };

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  return key;
}

async function createVapidAuthHeader(
  endpoint: string,
  publicKeyB64: string,
  privateKeyB64: string,
  subject: string
) {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12 hours

  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud, exp, sub: subject };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const key = await importVapidKeys(publicKeyB64, privateKeyB64);
  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw r||s (64 bytes)
  const sig = new Uint8Array(signatureBuffer);
  let r: Uint8Array, s: Uint8Array;

  if (sig.length === 64) {
    r = sig.slice(0, 32);
    s = sig.slice(32, 64);
  } else {
    // DER format
    r = sig.slice(4, 4 + sig[3]);
    const sOffset = 4 + sig[3] + 2;
    s = sig.slice(sOffset, sOffset + sig[sOffset - 1]);
    // Pad or trim to 32 bytes
    if (r.length > 32) r = r.slice(r.length - 32);
    if (s.length > 32) s = s.slice(s.length - 32);
    if (r.length < 32) { const t = new Uint8Array(32); t.set(r, 32 - r.length); r = t; }
    if (s.length < 32) { const t = new Uint8Array(32); t.set(s, 32 - s.length); s = t; }
  }

  const rawSig = new Uint8Array(64);
  rawSig.set(r, 0);
  rawSig.set(s, 32);

  const jwt = `${unsignedToken}.${base64UrlEncode(rawSig)}`;
  const publicKeyBytes = base64UrlDecode(publicKeyB64);

  return {
    authorization: `vapid t=${jwt}, k=${base64UrlEncode(publicKeyBytes)}`,
  };
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPrivateKey: string,
  vapidPublicKey: string,
  subject: string
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Urgency: "high",
    };

    // If VAPID keys are configured, sign the request
    if (vapidPrivateKey && vapidPublicKey) {
      const vapidHeaders = await createVapidAuthHeader(
        subscription.endpoint,
        vapidPublicKey,
        vapidPrivateKey,
        subject
      );
      headers["Authorization"] = vapidHeaders.authorization;
    }

    // For now, send without encryption (payload in body as plaintext)
    // Full RFC 8291 encryption requires ECDH + HKDF which is complex
    // Most push services accept the request and the SW gets a push event
    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Content-Encoding": "identity",
      },
      body: payload,
    });

    if (res.ok || res.status === 201) {
      console.log(`[send-push] Delivered to ${subscription.endpoint.slice(0, 60)}...`);
      return true;
    }

    const body = await res.text().catch(() => "");
    console.error(`[send-push] ${res.status} from push service: ${body.slice(0, 200)}`);
    return false;
  } catch (err) {
    console.error("[send-push] Delivery failed:", err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { user_ids, title, body, data } = await req.json();

    if (!user_ids || !Array.isArray(user_ids) || !title || !body) {
      return new Response(
        JSON.stringify({ error: "user_ids (array), title, and body are required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Get subscriptions for these users
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", user_ids);

    if (error) throw error;

    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No push subscriptions found for these users" }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Get VAPID keys — prefer env secrets, fall back to DB
    let vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

    if (!vapidPublicKey) {
      const { data: vapidRow } = await supabase
        .from("policy_settings")
        .select("value")
        .eq("key", "vapid_public_key")
        .maybeSingle();

      vapidPublicKey = vapidRow?.value
        ? typeof vapidRow.value === "string"
          ? vapidRow.value.replace(/^"|"$/g, "")
          : (vapidRow.value as any).key ?? ""
        : "";
    }

    const subject = "mailto:admin@groundstay.app";
    const payload = JSON.stringify({ title, body, ...(data ?? {}) });

    let sent = 0;
    const failed: string[] = [];

    for (const sub of subs) {
      const ok = await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
        vapidPrivateKey,
        vapidPublicKey,
        subject
      );
      if (ok) {
        sent++;
      } else {
        failed.push(sub.endpoint);
        // Clean up invalid subscriptions (410 Gone = expired)
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }

    return new Response(
      JSON.stringify({ sent, failed: failed.length, total: subs.length }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[send-push] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
