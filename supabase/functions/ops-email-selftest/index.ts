// ops-email-selftest
// -----------------------------------------------------------------------------
// Ops Control Tower verification check. Sends one email to the CALLER'S OWN
// address only — the recipient comes from the verified JWT, never from the
// request body. Composed at send time, so it goes out directly rather than
// through the template registry.
//
// POST {}  Auth: required, caller must hold admin or manager role.
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EmailAPIError, sendLovableEmail } from "npm:@lovable.dev/email-js@0.1.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
};

const SITE_NAME = "LMT CampStay";
const SENDER_DOMAIN = "notify.lmtcampstay.com";
const FROM_DOMAIN = "lmtcampstay.com";
const OPERATIONAL_ROLES = ["admin", "manager"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const apiKey = Deno.env.get("LOVABLE_API_KEY");

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.email) return json({ ok: false, error: "unauthorized" }, 401);
    const caller = userData.user;

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRoles } = await admin
      .from("user_roles").select("role").eq("user_id", caller.id);
    const allowed = (callerRoles ?? []).some((r: any) => OPERATIONAL_ROLES.includes(r.role));
    if (!allowed) return json({ ok: false, error: "forbidden" }, 403);

    if (!apiKey) return json({ ok: false, error: "email_not_configured" }, 500);

    const stamp = new Date().toISOString();
    const html =
      `<p>This is an Ops Control Tower verification email.</p>` +
      `<p>If you can read it, app email is alive. Sent ${stamp}.</p>`;
    const text = `Ops Control Tower verification email. If you can read this, app email is alive. Sent ${stamp}.`;

    try {
      await sendLovableEmail(
        {
          to: caller.email!,
          from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject: "Ops Control Tower — self test",
          html,
          text,
          purpose: "transactional",
          label: "ops_self_test",
          idempotency_key: `ops-self-test-${caller.id}-${Date.now()}`,
        },
        { apiKey, sendUrl: Deno.env.get("LOVABLE_SEND_URL") },
      );
    } catch (err) {
      if (err instanceof EmailAPIError && err.code === "recipient_suppressed") {
        const { error: logErr } = await admin.from("email_send_log").insert({
          message_id: crypto.randomUUID(),
          template_name: "ops_self_test",
          recipient_email: caller.email,
          status: "suppressed",
          metadata: { source: "ops_self_test", triggered_by: caller.id, sent_at: stamp },
        });
        if (logErr) console.error("email_send_log write failed", logErr);
        return json({ ok: false, error: "Your address is suppressed (bounce/unsubscribe)." });
      }
      const msg = err instanceof Error ? err.message : String(err);
      const { error: logErr } = await admin.from("email_send_log").insert({
        message_id: crypto.randomUUID(),
        template_name: "ops_self_test",
        recipient_email: caller.email,
        status: "failed",
        error_message: msg.slice(0, 1000),
        metadata: { source: "ops_self_test", triggered_by: caller.id, sent_at: stamp },
      });
      if (logErr) console.error("email_send_log write failed", logErr);
      return json({ ok: false, error: msg.slice(0, 300) }, 502);
    }

    const { error: logErr } = await admin.from("email_send_log").insert({
      message_id: crypto.randomUUID(),
      template_name: "ops_self_test",
      recipient_email: caller.email,
      status: "sent",
      metadata: { source: "ops_self_test", triggered_by: caller.id, sent_at: stamp },
    });
    if (logErr) console.error("email_send_log write failed", logErr);

    return json({ ok: true, to: caller.email });
  } catch (e) {
    console.error("[ops-email-selftest] fatal", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown_error" }, 500);
  }
});
