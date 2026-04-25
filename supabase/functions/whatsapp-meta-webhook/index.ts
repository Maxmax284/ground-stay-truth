// Public webhook for Meta WhatsApp Cloud API.
// - GET: handles Meta's verification handshake (hub.mode/hub.verify_token/hub.challenge)
// - POST: receives inbound message payloads, normalizes them, and forwards to messaging-router
//
// Configure in Meta App → WhatsApp → Configuration → Webhook:
//   Callback URL: <fn-url>/whatsapp-meta-webhook
//   Verify Token: must match the `whatsapp_meta_webhook_verify_token` secret
//   Subscribe to webhook field: `messages`
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function getSecret(admin: any, key: string): Promise<string | null> {
  const { data } = await admin
    .from("integration_secrets")
    .select("encrypted_value")
    .eq("secret_key", key)
    .maybeSingle();
  return data?.encrypted_value ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ─── Meta verification handshake (GET) ───
    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      const expected = await getSecret(admin, "whatsapp_meta_webhook_verify_token");
      if (mode === "subscribe" && token && expected && token === expected) {
        return new Response(challenge ?? "", { status: 200 });
      }
      return new Response("Forbidden", { status: 403 });
    }

    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    // ─── Inbound message payload (POST) ───
    // Meta payload shape:
    // { object, entry: [{ changes: [{ field: "messages", value: { messages: [...], contacts: [...] } }] }] }
    const payload = await req.json().catch(() => null);
    if (!payload || payload.object !== "whatsapp_business_account") {
      return new Response("ok", { status: 200 });
    }

    const internalToken = await getSecret(admin, "messaging_bridge_internal_token");
    if (!internalToken) {
      console.warn("messaging_bridge_internal_token not configured — dropping inbound");
      return new Response("ok", { status: 200 });
    }

    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change.field !== "messages") continue;
        const value = change.value ?? {};
        const messages = Array.isArray(value.messages) ? value.messages : [];
        const contacts = Array.isArray(value.contacts) ? value.contacts : [];
        const contactName = contacts[0]?.profile?.name ?? null;

        for (const msg of messages) {
          // Only handle text messages for the router. Other types (image, audio, etc.)
          // can be added later — for now we acknowledge to avoid Meta retries.
          if (msg.type !== "text" || !msg.text?.body) continue;
          const chatId = msg.from; // E.164 without leading +
          const text = msg.text.body;
          if (!chatId || !text) continue;

          try {
            await fetch(`${supabaseUrl}/functions/v1/messaging-router`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-internal-bridge": internalToken,
                Authorization: `Bearer ${serviceRoleKey}`,
                apikey: serviceRoleKey,
              },
              body: JSON.stringify({
                channel: "whatsapp",
                chat_id: chatId,
                text,
                display_name: contactName,
              }),
            });
            // Note: outbound reply (if any) is handled by the router calling
            // notify-via-messaging or sendWhatsAppMeta directly. We don't reply
            // synchronously here — Meta only needs a 200 OK to stop retrying.
          } catch (e) {
            console.error("router dispatch failed:", e);
          }
        }
      }
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("whatsapp-meta-webhook error:", e);
    // Return 200 anyway — Meta will retry on non-200, and we don't want loops.
    return new Response("ok", { status: 200 });
  }
});
