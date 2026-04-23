// Admin-triggered: registers (sets + verifies) the LINE webhook endpoint URL.
// LINE doesn't support arbitrary token query params on the webhook URL; the
// webhook is authenticated by the channel-secret HMAC signature instead.
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

    const accessToken = await getSecret(admin, "line_channel_access_token");
    const channelSecret = await getSecret(admin, "line_channel_secret");
    if (!accessToken || !channelSecret) {
      return new Response(
        JSON.stringify({ error: "missing_credentials", description: "Save Channel Access Token and Channel Secret first." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/line-webhook`;

    // 1. Set webhook endpoint
    const setResp = await fetch("https://api.line.me/v2/bot/channel/webhook/endpoint", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ endpoint: webhookUrl }),
    });
    if (!setResp.ok) {
      const errBody = await setResp.text();
      return new Response(
        JSON.stringify({ error: "line_set_failed", description: errBody.slice(0, 300) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Test: ask LINE to ping the endpoint
    const testResp = await fetch("https://api.line.me/v2/bot/channel/webhook/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ endpoint: webhookUrl }),
    });
    const testData = await testResp.json().catch(() => ({}));

    await upsertPolicy(admin, "line_webhook_registered", "true", userId);
    await upsertPolicy(admin, "line_webhook_url", JSON.stringify(webhookUrl), userId);

    return new Response(
      JSON.stringify({
        ok: true,
        webhookUrl,
        test: {
          success: testData?.success ?? null,
          statusCode: testData?.statusCode ?? null,
          reason: testData?.reason ?? null,
          detail: testData?.detail ?? null,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("line-register-webhook error:", e);
    return new Response(
      JSON.stringify({ error: "internal_error", description: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
