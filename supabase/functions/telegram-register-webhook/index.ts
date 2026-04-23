// Admin-triggered: registers the public webhook URL with Telegram.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

async function upsertPolicy(admin: any, key: string, value: string, userId: string | null) {
  const { data: existing } = await admin
    .from("policy_settings")
    .select("id")
    .eq("key", key)
    .is("property_id", null)
    .maybeSingle();
  if (existing?.id) {
    await admin.from("policy_settings").update({ value, updated_by: userId }).eq("id", existing.id);
  } else {
    await admin.from("policy_settings").insert({ key, value, updated_by: userId });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Auth check — admins/managers only
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub as string;
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const hasAccess = roles?.some((r: any) => r.role === "admin" || r.role === "manager");
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const botToken = await getSecret(admin, "telegram_bot_token");
    if (!botToken) {
      return new Response(JSON.stringify({ error: "no_token" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const tokenHash = (await sha256Hex(botToken)).slice(0, 32);
    const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook?token=${tokenHash}`;

    const tgResp = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message"],
        drop_pending_updates: false,
      }),
    });
    const tgData = await tgResp.json().catch(() => ({}));

    if (!tgData?.ok) {
      return new Response(
        JSON.stringify({ error: "telegram_error", description: tgData?.description ?? "unknown" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await upsertPolicy(admin, "telegram_webhook_registered", "true", userId);
    await upsertPolicy(admin, "telegram_webhook_url", JSON.stringify(webhookUrl), userId);

    return new Response(
      JSON.stringify({ ok: true, webhookUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("telegram-register-webhook error:", e);
    return new Response(
      JSON.stringify({ error: "internal_error", description: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
