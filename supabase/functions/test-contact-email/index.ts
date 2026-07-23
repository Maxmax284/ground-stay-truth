// test-contact-email
// -----------------------------------------------------------------------------
// Admin-only. Sends a short test email to the current policy_settings.contact_email
// (or an override) via Resend, so we can confirm the address actually receives
// mail. Returns provider status + Resend message id or the exact error body.
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
      .in("key", ["contact_email", "resend_from_email", "company_legal_name"]);
    const map = new Map((rows ?? []).map((r: any) => [r.key, unquote(r.value)]));
    const contactEmail = overrideTo || map.get("contact_email") || "";
    const fromEmail = map.get("resend_from_email") || "noreply@lmtcampstay.com";
    const bizName = map.get("company_legal_name") || "LMT CampStay";

    if (!contactEmail || !/^\S+@\S+\.\S+$/.test(contactEmail)) {
      return j(req, { sent: false, error: "No valid contact_email configured", contact_email: contactEmail }, 400);
    }

    const { data: secretRow } = await admin
      .from("integration_secrets")
      .select("encrypted_value")
      .eq("secret_key", "resend_api_key")
      .maybeSingle();
    const resendApiKey = secretRow?.encrypted_value;
    if (!resendApiKey || String(resendApiKey).length < 5) {
      return j(req, { sent: false, error: "Resend API key not configured" }, 400);
    }

    const stamp = new Date().toISOString();
    const subject = `LMT CampStay — deliverability test (${stamp.slice(0, 16).replace("T", " ")} UTC)`;
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#1a1a1a">
        <h1 style="font-size:20px;margin:0 0 8px 0">Deliverability test</h1>
        <p style="color:#555;margin:0 0 16px 0">
          This is a one-off test message from <strong>${bizName}</strong> to verify that
          <strong>${contactEmail}</strong> actually receives mail from
          <strong>${fromEmail}</strong>.
        </p>
        <div style="background:#f6f6f6;border-radius:10px;padding:14px;font-size:13px;color:#333">
          <div><strong>From:</strong> ${fromEmail}</div>
          <div><strong>To:</strong> ${contactEmail}</div>
          <div><strong>Sent:</strong> ${stamp}</div>
        </div>
        <p style="color:#888;font-size:12px;margin-top:16px">
          If this landed in the intended inbox, contact_email is reachable. If it bounced
          or never arrived, the forwarding / mailbox for this address needs attention.
          No guest, booking, or payment data was touched.
        </p>
      </div>`;

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [contactEmail],
        subject,
        html,
      }),
    });

    const providerBody = await resendResp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(providerBody); } catch { /* keep raw */ }

    if (!resendResp.ok) {
      console.error("[test-contact-email] Resend error", resendResp.status, providerBody);
      return j(req, {
        sent: false,
        status: resendResp.status,
        from: fromEmail,
        to: contactEmail,
        error: parsed?.message || parsed?.error || providerBody.slice(0, 400),
      }, 502);
    }

    return j(req, {
      sent: true,
      from: fromEmail,
      to: contactEmail,
      message_id: parsed?.id || null,
      note: "Resend accepted the message. Check the destination inbox (and spam) to confirm it actually arrived.",
    });
  } catch (e) {
    console.error("[test-contact-email] fatal", e);
    return j(req, { sent: false, error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
