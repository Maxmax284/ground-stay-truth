// Public Telegram webhook. Telegram POSTs updates to:
//   {SUPABASE_URL}/functions/v1/telegram-webhook?token={SHA256(bot_token).slice(0,32)}
// We verify the hash, forward to messaging-router, and reply via sendMessage.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function getSecret(admin: any, key: string): Promise<string | null> {
  const { data } = await admin
    .from("integration_secrets")
    .select("encrypted_value")
    .eq("secret_key", key)
    .maybeSingle();
  return data?.encrypted_value ?? null;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendTelegramMessage(botToken: string, chatId: number | string, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });
  // Always 200 to Telegram regardless of internal outcome
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const tokenParam = url.searchParams.get("token") ?? "";

    const botToken = await getSecret(admin, "telegram_bot_token");
    if (!botToken) return new Response("ok", { status: 200 });

    const expected = (await sha256Hex(botToken)).slice(0, 32);
    if (tokenParam !== expected) {
      console.warn("telegram-webhook: token hash mismatch");
      return new Response("ok", { status: 200 });
    }

    if (req.method !== "POST") return new Response("ok", { status: 200 });

    const update = await req.json().catch(() => null);
    const msg = update?.message;
    if (!msg?.chat?.id) return new Response("ok", { status: 200 });

    const chatId = String(msg.chat.id);
    const text = msg.text ?? msg.caption ?? "";
    const displayName =
      [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ").trim() ||
      msg.from?.username ||
      null;

    const internalToken = await getSecret(admin, "messaging_bridge_internal_token");
    if (!internalToken) {
      console.warn("telegram-webhook: missing internal bridge token");
      return new Response("ok", { status: 200 });
    }

    try {
      const routerResp = await fetch(`${supabaseUrl}/functions/v1/messaging-router`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-bridge": internalToken,
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
        body: JSON.stringify({ channel: "telegram", chat_id: chatId, text, display_name: displayName }),
      });
      const out = await routerResp.json().catch(() => ({}));
      if (out?.reply && !out.silent) {
        await sendTelegramMessage(botToken, chatId, out.reply);
      }
    } catch (e) {
      console.error("telegram-webhook: router/send failed", e);
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("telegram-webhook error:", e);
    return new Response("ok", { status: 200 });
  }
});
