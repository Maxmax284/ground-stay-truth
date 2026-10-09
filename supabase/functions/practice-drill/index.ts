// practice-drill
// Sends ONE [PRACTICE DRILL] urgent-alert email to the caller only.
// - Caller must be admin/manager AND an approved responder ("Can be notified").
// - Goes through the real emit-admin-alert path with practice_drill=true, which
//   isolates delivery to the caller (no camp admin inbox, no guests, no incident row).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (p: unknown, status = 200) =>
  new Response(JSON.stringify(p), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const token = Deno.env.get("ADMIN_ALERT_INTERNAL_TOKEN");
  if (!token) return json({ error: "alerts_not_configured" }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: u, error: ue } = await userClient.auth.getUser();
  if (ue || !u?.user) return json({ error: "unauthorized" }, 401);
  const uid = u.user.id;

  const admin = createClient(url, service);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
  if (!(roles ?? []).some((r: any) => r.role === "admin" || r.role === "manager")) return json({ error: "forbidden" }, 403);

  const { data: cap } = await admin.from("responder_capabilities").select("user_id")
    .eq("user_id", uid).eq("can_receive_alerts", true).limit(1);
  if (!cap || cap.length === 0) return json({ ok: false, error: "not_approved_responder" }); // expected setup state, not a crash

  const resp = await fetch(`${url}/functions/v1/emit-admin-alert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      internal_token: token,
      event_type: "urgent_guest_request",
      message: "Practice drill: this is a test urgent-help alert. No guest is involved and nothing needs doing.",
      deep_link: "/front-desk",
      triggered_by: "practice_drill",
      context: { practice_drill: true, responder_user_id: uid, dedupe_key: `drill-${crypto.randomUUID()}` },
    }),
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) return json({ error: "send_failed", detail: result }, 502);
  return json({ ok: true, email_sent: result.email_sent ?? 0, email_failed: result.email_failed ?? 0 });
});
