// sync-stripe-webhook-secret
// -----------------------------------------------------------------------------
// Break-glass path: copies the STRIPE_WEBHOOK_SECRET edge-function env var into
// `integration_secrets.stripe_webhook_secret`, which is the single source of
// truth read by payment-webhook and stripe-webhook-selftest.
//
// Admin-only. Never returns or logs the secret value — only a masked preview.
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";

function mask(v: string) {
  return `whsec_${"•".repeat(8)}${v.slice(-4)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(req);
  if (req.method !== "POST") return jsonResponse(req, { ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb = createClient(supabaseUrl, serviceRoleKey);

  // ── Admin auth ──
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return jsonResponse(req, { ok: false, error: "unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse(req, { ok: false, error: "unauthorized" }, 401);
  const { data: roleRow } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return jsonResponse(req, { ok: false, error: "forbidden_admin_only" }, 403);

  const whsec = (Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "").trim();
  if (!whsec.startsWith("whsec_")) {
    return jsonResponse(req, {
      ok: false,
      error: "STRIPE_WEBHOOK_SECRET env is missing or is not a whsec_ value",
    }, 400);
  }

  const { data: existing } = await sb
    .from("integration_secrets")
    .select("id")
    .eq("secret_key", "stripe_webhook_secret")
    .maybeSingle();

  const payload = { encrypted_value: whsec, updated_at: new Date().toISOString() };
  const { error: writeErr } = existing?.id
    ? await sb.from("integration_secrets").update(payload).eq("id", existing.id)
    : await sb.from("integration_secrets").insert({ secret_key: "stripe_webhook_secret", ...payload });

  if (writeErr) return jsonResponse(req, { ok: false, error: writeErr.message }, 500);

  // Masked only. The raw value must never appear in a response, log, or alert.
  return jsonResponse(req, { ok: true, stored_as: mask(whsec) });
});
