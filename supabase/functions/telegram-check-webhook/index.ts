// Returns Telegram's current webhook status (admin/manager only).
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims } = await userClient.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const hasAccess = roles?.some((r: any) => r.role === "admin" || r.role === "manager");
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const botToken = await getSecret(admin, "telegram_bot_token");
    if (!botToken) {
      return new Response(JSON.stringify({ configured: false }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const tgResp = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const tgData = await tgResp.json().catch(() => ({}));
    if (!tgData?.ok) {
      return new Response(
        JSON.stringify({ configured: false, error: tgData?.description ?? "unknown" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const info = tgData.result ?? {};
    return new Response(
      JSON.stringify({
        configured: !!info.url,
        url: info.url ?? null,
        pending_update_count: info.pending_update_count ?? 0,
        last_error_message: info.last_error_message ?? null,
        last_error_date: info.last_error_date ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("telegram-check-webhook error:", e);
    return new Response(
      JSON.stringify({ configured: false, error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
