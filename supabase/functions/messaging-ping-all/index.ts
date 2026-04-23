// Admin-triggered: pings every linked messaging chat with a short test message.
// Returns per-binding outcomes so the UI can render a delivery dashboard.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PingResult {
  binding_id: string;
  user_id: string;
  channel: string;
  chat_id: string;
  display_name: string | null;
  outcome: "sent" | "failed";
  error?: string;
  sent_at: string;
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${await r.text()}`);
}

async function sendLine(accessToken: string, chatId: string, text: string): Promise<void> {
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ to: chatId, messages: [{ type: "text", text: text.slice(0, 5000) }] }),
  });
  if (!r.ok) throw new Error(`LINE ${r.status}: ${await r.text()}`);
}

async function sendTwilio(
  sid: string,
  authToken: string,
  from: string,
  to: string,
  body: string,
  whatsapp: boolean,
): Promise<void> {
  const fromAddr = whatsapp ? `whatsapp:${from}` : from;
  const toAddr = whatsapp ? (to.startsWith("whatsapp:") ? to : `whatsapp:${to}`) : to;
  const params = new URLSearchParams({ From: fromAddr, To: toAddr, Body: body });
  const auth = btoa(`${sid}:${authToken}`);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify caller is admin or manager
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roleSet = new Set((roles || []).map((r) => r.role));
    if (!roleSet.has("admin") && !roleSet.has("manager")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load all confirmed bindings
    const { data: bindings, error: bindErr } = await admin
      .from("messaging_chat_bindings")
      .select("id, user_id, channel, chat_id, display_name");
    if (bindErr) throw bindErr;

    // Load credentials once
    const { data: tgSecret } = await admin.rpc("get_integration_secret", { _key: "telegram_bot_token" });
    const { data: twSid } = await admin.rpc("get_integration_secret", { _key: "twilio_account_sid" });
    const { data: twTok } = await admin.rpc("get_integration_secret", { _key: "twilio_auth_token" });
    const { data: twSms } = await admin.rpc("get_integration_secret", { _key: "twilio_sms_from" });
    const { data: twWa } = await admin.rpc("get_integration_secret", { _key: "twilio_whatsapp_from" });
    const { data: lineSecret } = await admin.rpc("get_integration_secret", { _key: "line_channel_access_token" });

    const results: PingResult[] = [];
    const logRows: any[] = [];

    for (const b of bindings || []) {
      const channelLabel =
        b.channel === "telegram" ? "Telegram"
        : b.channel === "whatsapp" ? "WhatsApp"
        : b.channel === "line" ? "LINE"
        : "SMS";
      const text = `✅ Ground Stay messaging is live — you're connected. ${channelLabel} is working.`;
      const sentAt = new Date().toISOString();
      try {
        if (b.channel === "telegram") {
          if (!tgSecret) throw new Error("Telegram bot token not configured");
          await sendTelegram(tgSecret, b.chat_id, text);
        } else if (b.channel === "whatsapp") {
          if (!twSid || !twTok || !twWa) throw new Error("Twilio WhatsApp credentials missing");
          await sendTwilio(twSid, twTok, twWa, b.chat_id, text, true);
        } else if (b.channel === "sms") {
          if (!twSid || !twTok || !twSms) throw new Error("Twilio SMS credentials missing");
          await sendTwilio(twSid, twTok, twSms, b.chat_id, text, false);
        } else if (b.channel === "line") {
          if (!lineSecret) throw new Error("LINE Channel Access Token not configured");
          await sendLine(lineSecret, b.chat_id, text);
        } else {
          throw new Error(`Unknown channel: ${b.channel}`);
        }
        results.push({
          binding_id: b.id,
          user_id: b.user_id,
          channel: b.channel,
          chat_id: b.chat_id,
          display_name: b.display_name,
          outcome: "sent",
          sent_at: sentAt,
        });
        logRows.push({
          user_id: b.user_id,
          channel: b.channel,
          chat_id: b.chat_id,
          notification_type: "admin_ping_test",
          outcome: "sent",
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({
          binding_id: b.id,
          user_id: b.user_id,
          channel: b.channel,
          chat_id: b.chat_id,
          display_name: b.display_name,
          outcome: "failed",
          error: msg,
          sent_at: sentAt,
        });
        logRows.push({
          user_id: b.user_id,
          channel: b.channel,
          chat_id: b.chat_id,
          notification_type: "admin_ping_test",
          outcome: "failed",
          error: msg,
        });
      }
    }

    if (logRows.length) {
      await admin.from("messaging_notification_log").insert(logRows);
    }

    return new Response(
      JSON.stringify({
        total: results.length,
        sent: results.filter((r) => r.outcome === "sent").length,
        failed: results.filter((r) => r.outcome === "failed").length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("messaging-ping-all error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
