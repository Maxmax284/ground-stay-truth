// Returns auto-resolved bot identities (Telegram username, WhatsApp number)
// derived from the saved integration secrets. Used by the UI to build
// one-tap deep links (https://t.me/<username>?start=link_<code>,
// https://wa.me/<number>?text=/link <code>) without admins having to
// hand-enter the username/number.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

async function getSecret(admin: any, key: string): Promise<string | null> {
  const { data } = await admin
    .from("integration_secrets")
    .select("encrypted_value")
    .eq("secret_key", key)
    .maybeSingle();
  return data?.encrypted_value ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller is signed in (any authenticated user can ask "what's the bot username")
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── Telegram: ask Telegram who we are ──
    let telegram: { configured: boolean; username: string | null; error?: string } = {
      configured: false, username: null,
    };
    const tgToken = await getSecret(admin, "telegram_bot_token");
    if (tgToken) {
      try {
        const resp = await fetch(`https://api.telegram.org/bot${tgToken}/getMe`);
        const data = await resp.json();
        if (data.ok && data.result?.username) {
          telegram = { configured: true, username: data.result.username };
        } else {
          telegram = { configured: true, username: null, error: data.description || "getMe failed" };
        }
      } catch (e) {
        telegram = { configured: true, username: null, error: e instanceof Error ? e.message : "network error" };
      }
    }

    // ── WhatsApp: derive number from saved policy setting (admin-entered) ──
    // whatsapp_public_number is the public-facing E.164 number guests deep-link to.
    // Stored as a policy setting because it's display-only (not a secret).
    let whatsapp: { configured: boolean; number: string | null } = {
      configured: false, number: null,
    };
    const { data: waNumberRow } = await admin
      .from("policy_settings")
      .select("value")
      .eq("key", "whatsapp_public_number")
      .maybeSingle();
    const waFromRaw = waNumberRow?.value ? String(waNumberRow.value).replace(/^"|"$/g, "") : "";
    if (waFromRaw) {
      const cleaned = waFromRaw.replace(/^whatsapp:/i, "").replace(/[^\d+]/g, "");
      if (cleaned.length >= 6) {
        whatsapp = { configured: true, number: cleaned.startsWith("+") ? cleaned.slice(1) : cleaned };
      }
    }

    return new Response(
      JSON.stringify({ telegram, whatsapp }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("bot-identity error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
