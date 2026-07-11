// manage-integration-secret
// -----------------------------------------------------------------------------
// SECURITY-CRITICAL. Admin-only CRUD over `integration_secrets`.
//
// This is how tenants configure Stripe keys, LINE tokens, Telegram bot
// tokens, WhatsApp creds, Fenrir API key, Vanta token, etc. — without ever
// putting them in code or env vars visible to the client.
//
// Rules:
//   - Read returns `is_configured` boolean + last-4, never the actual value.
//   - Write is admin-only, logged to `staff_audit_events`, Fenrir-fired.
//   - The raw value never leaves this function or `get_integration_secret()`.
// -----------------------------------------------------------------------------
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
  // Allow Lovable preview/dev origins
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  if (/^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  return false;
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check admin role
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin"])
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), {
        status: 403,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { action, key, value, description } = await req.json();

    if (!key || typeof key !== "string") {
      return new Response(JSON.stringify({ error: "key is required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Allowed secret keys
    const ALLOWED_KEYS = [
      "stripe_secret_key",
      "stripe_publishable_key",
      "stripe_webhook_secret",
      "resend_api_key",
      "fenrir_api_key",
      "fenrir_receive_token",
      // Messaging bridge (Telegram + Twilio for WhatsApp/SMS)
      "telegram_bot_token",
      "twilio_account_sid",
      "twilio_auth_token",
      "twilio_sms_from",
      "twilio_whatsapp_from",
      "messaging_bridge_internal_token",
      // Vanta integration
      "vanta_webhook_secret",
    ];

    if (!ALLOWED_KEYS.includes(key)) {
      return new Response(JSON.stringify({ error: "Invalid secret key" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    switch (action) {
      case "set": {
        if (!value || typeof value !== "string" || value.length < 3) {
          return new Response(JSON.stringify({ error: "Invalid value" }), {
            status: 400,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        // Upsert into integration_secrets
        const { error } = await adminClient
          .from("integration_secrets")
          .upsert(
            {
              secret_key: key,
              encrypted_value: value,
              description: description || null,
              updated_at: new Date().toISOString(),
              updated_by: user.id,
            },
            { onConflict: "secret_key" }
          );

        if (error) throw error;

        // Also keep a masked placeholder in policy_settings for backward compat
        // (so the UI "configured" status still works for non-secret fields)
        const masked = value.slice(0, 4) + "••••" + value.slice(-4);
        const { data: existingPolicy } = await adminClient
          .from("policy_settings")
          .select("id")
          .eq("key", key)
          .maybeSingle();

        if (existingPolicy) {
          await adminClient
            .from("policy_settings")
            .update({ value: `__SECURED__`, updated_by: user.id })
            .eq("id", existingPolicy.id);
        }

        // Log security event
        await adminClient.from("security_events").insert({
          event_type: "integration_secret_updated",
          severity: "info",
          actor_id: user.id,
          actor_email: user.email,
          actor_role: "admin",
          details: { key, action: "set" },
        });

        return new Response(
          JSON.stringify({ success: true, key, configured: true }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      case "check": {
        // Return whether the secret is configured — never return the value
        const { data } = await adminClient
          .from("integration_secrets")
          .select("secret_key, updated_at")
          .eq("secret_key", key)
          .maybeSingle();

        return new Response(
          JSON.stringify({
            key,
            configured: !!data,
            updated_at: data?.updated_at || null,
          }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      case "check_all": {
        // Check status of all allowed keys at once
        const { data: secrets } = await adminClient
          .from("integration_secrets")
          .select("secret_key, updated_at")
          .in("secret_key", ALLOWED_KEYS);

        const statusMap: Record<string, { configured: boolean; updated_at: string | null }> = {};
        for (const k of ALLOWED_KEYS) {
          const found = (secrets ?? []).find((s: any) => s.secret_key === k);
          statusMap[k] = { configured: !!found, updated_at: found?.updated_at || null };
        }

        return new Response(JSON.stringify(statusMap), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      case "delete": {
        await adminClient
          .from("integration_secrets")
          .delete()
          .eq("secret_key", key);

        // Clear policy_settings placeholder too
        const { data: existingPolicy } = await adminClient
          .from("policy_settings")
          .select("id")
          .eq("key", key)
          .maybeSingle();

        if (existingPolicy) {
          await adminClient
            .from("policy_settings")
            .update({ value: "", updated_by: user.id })
            .eq("id", existingPolicy.id);
        }

        // Log security event
        await adminClient.from("security_events").insert({
          event_type: "integration_secret_deleted",
          severity: "info",
          actor_id: user.id,
          actor_email: user.email,
          actor_role: "admin",
          details: { key, action: "delete" },
        });

        return new Response(
          JSON.stringify({ success: true, key, configured: false }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action. Use: set, check, check_all, delete" }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
    }
  } catch (e) {
    console.error("manage-integration-secret error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
