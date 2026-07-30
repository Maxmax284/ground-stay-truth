// create-notification
// -----------------------------------------------------------------------------
// Server-side notification writer with fan-out. Given a user (or a role +
// property scope), inserts `notifications` rows and — if the recipient has
// push subs — calls `send-push`. Preferred over client-side inserts so
// permissions and fan-out logic stay in one place.
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://lmtcampstay.com",
  "https://lmtcampstay.com",
  "https://www.lmtcampstay.com",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller identity and role
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Only staff (front_desk+) can create notifications
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerRoles } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const staffRoles = ["front_desk", "front_desk_supervisor", "manager", "admin"];
    const hasStaffRole = callerRoles?.some((r: any) => staffRoles.includes(r.role));

    if (!hasStaffRole) {
      return new Response(
        JSON.stringify({ error: "Only staff can create notifications" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Parse body
    const { notifications } = await req.json();
    if (!Array.isArray(notifications) || notifications.length === 0) {
      return new Response(JSON.stringify({ error: "notifications array required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Validate each payload
    for (const n of notifications) {
      if (!n.user_id || !n.type || !n.message) {
        return new Response(
          JSON.stringify({ error: "Each notification needs user_id, type, message" }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
    }

    const rows = notifications.map((n: any) => ({
      user_id: n.user_id,
      type: n.type,
      reference_id: n.reference_id ?? null,
      message: n.message,
    }));

    const { error: insertError } = await serviceClient.from("notifications").insert(rows);
    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fire-and-forget: send push notifications to all targeted users
    const uniqueUserIds = [...new Set(rows.map((r: any) => r.user_id))];
    const pushTypes: Record<string, string> = {
      booking: "📋 Booking",
      payment: "💳 Payment",
      maintenance: "🔧 Maintenance",
      laundry: "👕 Laundry",
      override: "⚠️ Override",
      stay_essentials: "🏠 Stay Info",
      message: "💬 Message",
      review: "⭐ Review",
      flight: "✈️ Flight",
    };

    // Group messages by user for a cleaner push
    const byUser = new Map<string, string[]>();
    for (const r of rows) {
      const msgs = byUser.get(r.user_id) ?? [];
      msgs.push(r.message);
      byUser.set(r.user_id, msgs);
    }

    try {
      const firstNotif = rows[0];
      const typeLabel = pushTypes[firstNotif.type] || "Notification";

      await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          user_ids: uniqueUserIds,
          title: `LMT CampStay — ${typeLabel}`,
          body: rows.length === 1
            ? firstNotif.message
            : `${rows.length} new notifications`,
          source: "create-notification",
          data: {
            type: firstNotif.type,
            reference_id: firstNotif.reference_id,
            url: firstNotif.reference_id ? `/notifications` : "/",
          },
        }),
      });
    } catch (pushErr) {
      // Non-blocking: log but don't fail the notification creation
      console.error("[create-notification] Push delivery error:", pushErr);
    }

    return new Response(JSON.stringify({ ok: true, count: rows.length }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
