// Polls Telegram getUpdates and forwards each message to messaging-router.
// Designed to be invoked by pg_cron every minute. Each invocation long-polls
// for up to ~50s, fitting inside the 60s cron interval.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

async function getSecret(admin: any, key: string): Promise<string | null> {
  const { data } = await admin
    .from("integration_secrets")
    .select("encrypted_value")
    .eq("secret_key", key)
    .maybeSingle();
  return data?.encrypted_value ?? null;
}

async function sendTelegramMessage(botToken: string, chatId: number | string, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

Deno.serve(async () => {
  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const botToken = await getSecret(admin, "telegram_bot_token");
  const internalToken = await getSecret(admin, "messaging_bridge_internal_token");
  if (!botToken || !internalToken) {
    return new Response(JSON.stringify({ skipped: "telegram or bridge token not configured" }), { status: 200 });
  }

  // Read offset
  const { data: state } = await admin
    .from("telegram_bot_state")
    .select("update_offset")
    .eq("id", 1)
    .single();
  let offset = state?.update_offset ?? 0;
  let processed = 0;

  while (true) {
    const elapsed = Date.now() - startTime;
    const remaining = MAX_RUNTIME_MS - elapsed;
    if (remaining < MIN_REMAINING_MS) break;
    const timeout = Math.min(50, Math.floor(remaining / 1000) - 5);
    if (timeout < 1) break;

    const resp = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset, timeout, allowed_updates: ["message"] }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("getUpdates failed", resp.status, t);
      break;
    }
    const data = await resp.json();
    const updates = (data.result ?? []) as any[];
    if (!updates.length) continue;

    for (const u of updates) {
      const msg = u.message;
      if (!msg?.chat?.id) continue;
      const chatId = String(msg.chat.id);
      const text = msg.text ?? msg.caption ?? "";
      const displayName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ").trim() || msg.from?.username || null;

      try {
        const routerResp = await fetch(`${supabaseUrl}/functions/v1/messaging-router`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-bridge": internalToken,
            // Include service-role auth so the function gateway accepts the call
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
          },
          body: JSON.stringify({ channel: "telegram", chat_id: chatId, text, display_name: displayName }),
        });
        const out = await routerResp.json().catch(() => ({}));
        if (out.reply) {
          await sendTelegramMessage(botToken, chatId, out.reply);
        }
      } catch (e) {
        console.error("router/send failed", e);
      }
    }

    // Advance offset only after handling
    offset = Math.max(...updates.map((u: any) => u.update_id)) + 1;
    await admin
      .from("telegram_bot_state")
      .update({ update_offset: offset, updated_at: new Date().toISOString() })
      .eq("id", 1);
    processed += updates.length;
  }

  return new Response(JSON.stringify({ ok: true, processed, finalOffset: offset }), {
    headers: { "Content-Type": "application/json" },
  });
});
