// test-contact-email
// -----------------------------------------------------------------------------
// Admin-only. Sends a short test email to the current policy_settings.contact_email
// (or an override) through the platform email service, so we can confirm the
// address actually receives mail. Returns queue status or the exact error body.
// No email_log write, no booking touch.
// -----------------------------------------------------------------------------
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://lmtcampstay.com",
  "https://lmtcampstay.com",
  "https://www.lmtcampstay.com",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];
function isAllowed(o: string) {
  if (ALLOWED_ORIGINS.includes(o)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(o)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(o)) return true;
  if (/^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/.test(o)) return true;
  return false;
}
function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowed(o) ? o : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}
function j(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}
function unquote(v: any, fallback = "") {
  if (v == null) return fallback;
  if (typeof v === "string") return v.replace(/^"|"$/g, "");
  return String(v).replace(/^"|"$/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return j(req, { error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uerr } = await userClient.auth.getUser();
    if (uerr || !user) return j(req, { error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) return j(req, { error: "Admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const overrideTo = typeof body?.to === "string" ? body.to.trim() : "";

    // Pull the addresses we want to test against
    const { data: rows } = await admin
      .from("policy_settings")
      .select("key, value")
      .in("key", ["contact_email", "email_from_address", "company_legal_name"]);
    const map = new Map((rows ?? []).map((r: any) => [r.key, unquote(r.value)]));
    const contactEmail = overrideTo || map.get("contact_email") || "";
    const fromEmail = map.get("email_from_address") || "noreply@lmtcampstay.com";
    const bizName = map.get("company_legal_name") || "LMT CampStay";

    if (!contactEmail || !/^\S+@\S+\.\S+$/.test(contactEmail)) {
      return j(req, { sent: false, error: "No valid contact_email configured", contact_email: contactEmail }, 400);
    }

    const stamp = new Date().toISOString();

    // Routed through the platform email engine (queued + retried + logged).
    const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_key: "admin_alert_generic",
        recipient_email: contactEmail,
        idempotency_key: `contact-test-${stamp}`,
        data: {
          title: "Deliverability test",
          message: `One-off test from ${bizName} to confirm ${contactEmail} actually receives mail.`,
          severity: "info",
          context: { to: contactEmail, sent_at: stamp },
        },
      }),
    });

    const providerBody = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(providerBody); } catch { /* keep raw */ }

    if (!resp.ok || parsed?.success === false) {
      console.error("[test-contact-email] send failed", resp.status, providerBody);
      return j(req, {
        sent: false,
        status: resp.status,
        to: contactEmail,
        error: parsed?.error || parsed?.reason || providerBody.slice(0, 400),
      }, 502);
    }

    return j(req, {
      sent: true,
      from: fromEmail,
      to: contactEmail,
      message_id: null,
      note: "Queued by the platform email service. Delivery happens within seconds — check the destination inbox (and spam) to confirm it arrived.",
    });
  } catch (e) {
    console.error("[test-contact-email] fatal", e);
    return j(req, { sent: false, error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
