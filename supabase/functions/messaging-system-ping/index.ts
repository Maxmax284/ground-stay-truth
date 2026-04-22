// Admin-only "Run System Ping". Sends a tiny health-check message to every
// linked chat across all channels. Rate-limited to once per hour per admin
// using messaging_notification_log.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PING_TEXT = "Kru Glitch system check — you're all set.";
const RATE_LIMIT_TYPE = "system_ping_initiated";

async function sendTelegram(token: string, chatId: string, text: string) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${await r.text()}`);
}
async function sendTwilio(sid: string, tok: string, from: string, to: string, body: string, whatsapp: boolean) {
  const fromAddr = whatsapp ? `whatsapp:${from}` : from;
  const toAddr = whatsapp ? (to.startsWith("whatsapp:") ? to : `whatsapp:${to}`) : to;
  const params = new URLSearchParams({ From: fromAddr, To: toAddr, Body: body });
  const auth = btoa(`${sid}:${tok}`);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${await r.text()}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    if (!roleSet.has("admin") && !roleSet.has("manager")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: once per hour per admin
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from("messaging_notification_log")
      .select("id, created_at")
      .eq("user_id", user.id)
      .eq("notification_type", RATE_LIMIT_TYPE)
      .gte("created_at", oneHourAgo)
      .limit(1);
    if (recent && recent.length > 0) {
      const last = new Date(recent[0].created_at).getTime();
      const minsLeft = Math.ceil((60 * 60 * 1000 - (Date.now() - last)) / 60000);
      return new Response(JSON.stringify({
        error: `Rate limited. Try again in ${minsLeft} min.`,
      }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Mark this run for rate-limit tracking
    await admin.from("messaging_notification_log").insert({
      user_id: user.id, channel: "system", chat_id: "n/a",
      notification_type: RATE_LIMIT_TYPE, outcome: "sent",
    });

    const { data: bindings } = await admin
      .from("messaging_chat_bindings")
      .select("id, user_id, channel, chat_id, display_name");

    const [tg, twSid, twTok, twSms, twWa] = await Promise.all([
      admin.rpc("get_integration_secret", { _key: "telegram_bot_token" }),
      admin.rpc("get_integration_secret", { _key: "twilio_account_sid" }),
      admin.rpc("get_integration_secret", { _key: "twilio_auth_token" }),
      admin.rpc("get_integration_secret", { _key: "twilio_sms_from" }),
      admin.rpc("get_integration_secret", { _key: "twilio_whatsapp_from" }),
    ]);

    let sent = 0, failed = 0;
    const logRows: any[] = [];
    for (const b of bindings ?? []) {
      try {
        if (b.channel === "telegram") {
          if (!tg.data) throw new Error("Telegram bot token not configured");
          await sendTelegram(tg.data, b.chat_id, PING_TEXT);
        } else if (b.channel === "whatsapp") {
          if (!twSid.data || !twTok.data || !twWa.data) throw new Error("Twilio WhatsApp not configured");
          await sendTwilio(twSid.data, twTok.data, twWa.data, b.chat_id, PING_TEXT, true);
        } else if (b.channel === "sms") {
          if (!twSid.data || !twTok.data || !twSms.data) throw new Error("Twilio SMS not configured");
          await sendTwilio(twSid.data, twTok.data, twSms.data, b.chat_id, PING_TEXT, false);
        } else {
          throw new Error(`Unknown channel: ${b.channel}`);
        }
        sent++;
        logRows.push({
          user_id: b.user_id, channel: b.channel, chat_id: b.chat_id,
          notification_type: "system_ping", outcome: "sent",
        });
      } catch (e) {
        failed++;
        logRows.push({
          user_id: b.user_id, channel: b.channel, chat_id: b.chat_id,
          notification_type: "system_ping", outcome: "failed",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (logRows.length) await admin.from("messaging_notification_log").insert(logRows);

    return new Response(JSON.stringify({
      total: (bindings ?? []).length, sent, failed,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("messaging-system-ping error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
