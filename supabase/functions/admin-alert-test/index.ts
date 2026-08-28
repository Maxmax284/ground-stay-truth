// admin-alert-test
// -----------------------------------------------------------------------------
// "Send Test Email to All Admins" — Settings → Notifications.
//
// Two modes:
//   { action: "preview" } -> returns the recipient list (no email sent)
//   { action: "send" }    -> sends one test admin alert per recipient
//
// Safety:
//   - Caller must hold admin or manager role (validated in-code from the JWT).
//   - Only users holding admin/manager roles with a real email receive it.
//   - Never touches bookings, payments, Stripe, or guest email paths.
//   - Every send is written to `admin_alert_log` with is_test = true.
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
};

const OPERATIONAL_ROLES = ["admin", "manager"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const caller = userData.user;

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerRoles } = await admin
      .from("user_roles").select("role").eq("user_id", caller.id);
    const callerIsOperational = (callerRoles ?? []).some((r: any) =>
      OPERATIONAL_ROLES.includes(r.role),
    );
    if (!callerIsOperational) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action === "send" ? "send" : "preview";

    // Resolve operational recipients.
    const { data: roleRows } = await admin
      .from("user_roles").select("user_id, role").in("role", OPERATIONAL_ROLES);
    const roleByUser = new Map<string, string[]>();
    for (const r of roleRows ?? []) {
      const list = roleByUser.get(r.user_id as string) ?? [];
      list.push(r.role as string);
      roleByUser.set(r.user_id as string, list);
    }
    const ids = Array.from(roleByUser.keys());
    const { data: profiles } = await admin
      .from("profiles").select("user_id, email, full_name").in("user_id", ids);

    const recipients = (profiles ?? [])
      .filter((p: any) => typeof p.email === "string" && p.email.includes("@"))
      .map((p: any) => ({
        user_id: p.user_id as string,
        email: p.email as string,
        name: (p.full_name as string) || "Team",
        roles: roleByUser.get(p.user_id) ?? [],
      }));

    if (action === "preview") {
      return json({ ok: true, action, recipients, skipped: ids.length - recipients.length });
    }

    const triggeredByName =
      (await admin.from("profiles").select("full_name, email").eq("user_id", caller.id).maybeSingle())
        .data?.full_name || caller.email || "an admin";
    const whenLabel = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short",
    }).format(new Date());
    const eventId = crypto.randomUUID();

    const results: Array<{ email: string; ok: boolean; error?: string }> = [];
    for (const r of recipients) {
      let ok = false;
      let failure: string | null = null;
      try {
        const result = await sendAppEmail({
          templateName: "admin_alert_generic",
          recipientEmail: r.email,
          language: "en",
          source: "admin-alert-test",
          // Unique key per send so repeated tests are never de-duplicated.
          idempotencyKey: `admin-test-${eventId}-${r.user_id}`,
          templateData: {
            subject_line: "[CampStay Test] Admin email alerts are working",
            severity: "info",
            category_label: "Test alert — admin email lane",
            recipient_name: r.name,
            what_happened:
              "This is a test admin alert from LMT CampStay. If you can read this, the admin email lane is working.",
            when_label: `${whenLabel} (Bangkok time)`,
            where_label: "Settings → Notifications",
            why_it_matters:
              "Admin email is the reliable paper trail for operational alerts. Phone push alerts are separate.",
            next_action:
              "Nothing to do. No booking, payment, or guest record was changed by this test.",
            context: {
              "Triggered By": triggeredByName,
              "Sent From": "lmtcampstay.com",
              "Your Roles": r.roles.join(", "),
            },
            action_url: "https://lmtcampstay.com/settings",
            action_label: "Open notification settings",
          },
        });
        ok = result.sent;
        if (!ok) {
          failure =
            "error" in result
              ? String(result.error).slice(0, 300)
              : `not sent: ${result.reason}`;
        }
      } catch (e) {
        failure = e instanceof Error ? e.message : "dispatch error";
      }

      results.push({ email: r.email, ok, error: failure ?? undefined });
      await admin.from("admin_alert_log").insert({
        event_id: eventId,
        event_type: "admin_test_email",
        category: "email_delivery",
        severity: "info",
        channel: "email",
        recipient_user_id: r.user_id,
        recipient_email: r.email,
        status: ok ? "sent" : "failed",
        failure_reason: failure,
        triggered_by: triggeredByName,
        template_key: "admin_alert_generic",
        is_test: true,
      });
    }

    return json({
      ok: true,
      action,
      event_id: eventId,
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (e) {
    console.error("admin-alert-test error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
