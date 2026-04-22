// Public webhook for Twilio SMS + WhatsApp inbound messages.
// Verifies the X-Twilio-Signature, dispatches to messaging-router,
// and replies with TwiML <Response><Message>...</Message></Response>.
//
// Configure in Twilio Console:
//  - SMS number: A MESSAGE COMES IN -> Webhook -> POST <fn-url>?channel=sms
//  - WhatsApp sandbox/number: WHEN A MESSAGE COMES IN -> POST <fn-url>?channel=whatsapp
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

// Twilio signature: HMAC-SHA1 of (full_url + sorted concatenated POST params).
// https://www.twilio.com/docs/usage/webhooks/webhooks-security
function verifyTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string): boolean {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const k of sortedKeys) data += k + params[k];
  const computed = createHmac("sha1", authToken).update(data).digest("base64");
  return computed === signature;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

function twiml(reply: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(reply)}</Message></Response>`;
  return new Response(xml, { headers: { "Content-Type": "text/xml" } });
}

function emptyTwiml(): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, { headers: { "Content-Type": "text/xml" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const channelParam = url.searchParams.get("channel");
    if (channelParam !== "sms" && channelParam !== "whatsapp") {
      return new Response("channel query param required (sms|whatsapp)", { status: 400 });
    }
    const channel = channelParam as "sms" | "whatsapp";

    // Twilio sends application/x-www-form-urlencoded
    const rawBody = await req.text();
    const formParams: Record<string, string> = {};
    new URLSearchParams(rawBody).forEach((v, k) => { formParams[k] = v; });

    const authToken = await getSecret(admin, "twilio_auth_token");
    if (!authToken) {
      return twiml("Twilio is not configured yet — front desk has been notified.");
    }

    // Verify signature
    const signature = req.headers.get("x-twilio-signature") || "";
    const fullUrl = req.url; // includes query string
    const valid = verifyTwilioSignature(authToken, fullUrl, formParams, signature);
    if (!valid) {
      console.warn("Twilio signature invalid", { url: fullUrl });
      return new Response("Forbidden", { status: 403 });
    }

    const from = formParams["From"] || ""; // e.g. "+15551234567" or "whatsapp:+15551234567"
    const text = formParams["Body"] || "";
    const profileName = formParams["ProfileName"] || null; // WhatsApp only
    const chatId = from.replace(/^whatsapp:/, "");

    if (!chatId || !text) return emptyTwiml();

    const internalToken = await getSecret(admin, "messaging_bridge_internal_token");
    if (!internalToken) return twiml("Messaging bridge is not configured yet.");

    const routerResp = await fetch(`${supabaseUrl}/functions/v1/messaging-router`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-bridge": internalToken,
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ channel, chat_id: chatId, text, display_name: profileName }),
    });
    const out = await routerResp.json().catch(() => ({}));
    // Silent mode (staff has taken over): return empty TwiML so Twilio sends nothing.
    if (out.silent || out.reply === "") {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, {
        headers: { "Content-Type": "text/xml" },
      });
    }
    return twiml(out.reply || "Got it.");
  } catch (e) {
    console.error("twilio-webhook error:", e);
    return twiml("Something glitched on my end — try again in a moment.");
  }
});
