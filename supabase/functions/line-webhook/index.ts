// Public LINE Messaging API webhook.
// Verifies x-line-signature (HMAC-SHA256 of raw body using channel secret),
// dispatches inbound text messages to messaging-router, and replies via
// LINE's reply API (always-free reply token, in contrast to push messages).
//
// Configure in LINE Developers Console:
//   Messaging API → Webhook URL → {SUPABASE_URL}/functions/v1/line-webhook
//   Use webhook = ON, Auto-reply = OFF, Greeting = optional
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

async function getSecret(admin: any, key: string): Promise<string | null> {
  const { data } = await admin
    .from("integration_secrets")
    .select("encrypted_value")
    .eq("secret_key", key)
    .maybeSingle();
  return data?.encrypted_value ?? null;
}

function verifyLineSignature(channelSecret: string, rawBody: string, signature: string): boolean {
  const expected = createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  return expected === signature;
}

async function lineReply(accessToken: string, replyToken: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text: text.slice(0, 5000) }],
    }),
  });
}

async function fetchLineDisplayName(accessToken: string, userId: string): Promise<string | null> {
  try {
    const r = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data?.displayName ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });
  // Always 200 to LINE so it doesn't disable the webhook on transient errors.
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    if (req.method !== "POST") return new Response("ok", { status: 200 });

    const rawBody = await req.text();
    const signature = req.headers.get("x-line-signature") || "";

    const channelSecret = await getSecret(admin, "line_channel_secret");
    const accessToken = await getSecret(admin, "line_channel_access_token");
    if (!channelSecret || !accessToken) {
      console.warn("line-webhook: credentials missing");
      return new Response("ok", { status: 200 });
    }

    if (!verifyLineSignature(channelSecret, rawBody, signature)) {
      console.warn("line-webhook: signature invalid");
      return new Response("ok", { status: 200 });
    }

    const internalToken = await getSecret(admin, "messaging_bridge_internal_token");
    if (!internalToken) {
      console.warn("line-webhook: missing internal bridge token");
      return new Response("ok", { status: 200 });
    }

    const payload = JSON.parse(rawBody) as { events?: any[] };
    const events = payload.events ?? [];

    for (const ev of events) {
      if (ev.type !== "message" || ev.message?.type !== "text") continue;
      const chatId = ev.source?.userId || ev.source?.groupId || ev.source?.roomId;
      const text = ev.message?.text ?? "";
      const replyToken = ev.replyToken;
      if (!chatId || !text) continue;

      const displayName = ev.source?.userId
        ? await fetchLineDisplayName(accessToken, ev.source.userId)
        : null;

      try {
        const routerResp = await fetch(`${supabaseUrl}/functions/v1/messaging-router`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-bridge": internalToken,
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
          },
          body: JSON.stringify({ channel: "line", chat_id: chatId, text, display_name: displayName }),
        });
        const out = await routerResp.json().catch(() => ({}));
        if (out?.reply && !out.silent && replyToken) {
          // Reply API is always free — no monthly quota.
          await lineReply(accessToken, replyToken, out.reply);
        }
      } catch (e) {
        console.error("line-webhook: router/send failed", e);
      }
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("line-webhook error:", e);
    return new Response("ok", { status: 200 });
  }
});
