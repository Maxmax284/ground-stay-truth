import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const whsec = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  if (!whsec.startsWith("whsec_")) {
    return new Response(JSON.stringify({ ok: false, error: "STRIPE_WEBHOOK_SECRET env is missing or not a whsec_ value", length: whsec.length }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error: upErr } = await sb.from("integration_secrets").update({ encrypted_value: whsec, updated_at: new Date().toISOString() }).eq("secret_key", "stripe_webhook_secret");
  if (upErr) return new Response(JSON.stringify({ ok: false, error: upErr.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ ok: true, length: whsec.length, prefix: whsec.slice(0, 8) }), { headers: { "Content-Type": "application/json" } });
});
