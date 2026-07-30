// emit-admin-alert
// -----------------------------------------------------------------------------
// Phase 1 admin notification fan-out. Called only by DB triggers with an
// internal token. Resolves admin/manager recipients, inserts in-app
// `notifications` rows (which fire realtime + push automatically via existing
// pipes), and dispatches admin-alert emails via send-transactional-email
// respecting per-user preferences in `messaging_notification_prefs`.
//
// Preference model:
//   - channel='in_app'  : default ON when no row exists
//   - channel='email'   : default OFF when no row exists (opt-in per event)
//   - channel='telegram': existing behaviour is preserved (handled elsewhere)
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

interface AlertPayload {
  internal_token: string;
  event_type: string;
  message: string;
  reference_id?: string | null;
  deep_link?: string | null;
  context?: Record<string, unknown>;
}

// Map event_type → notification.type bucket (used by NotificationBell icons + sounds).
const EVENT_TO_NOTIF_TYPE: Record<string, string> = {
  new_booking_request: "booking",
  booking_cancelled: "booking",
  airport_pickup_requested: "booking",
  guest_message_received: "message",
  deposit_paid: "payment",
  balance_paid: "payment",
  payment_link_failed: "payment",
  stripe_diagnostics_no_go: "payment",
  webhook_failure: "override",
};

const EVENT_LABELS: Record<string, string> = {
  new_booking_request: "New booking request",
  booking_cancelled: "Booking cancelled",
  airport_pickup_requested: "Airport pickup requested",
  guest_message_received: "Guest message received",
  deposit_paid: "Deposit paid",
  balance_paid: "Balance paid",
  payment_link_failed: "Payment link failed",
  stripe_diagnostics_no_go: "Stripe diagnostics: NO-GO",
  webhook_failure: "Webhook failure",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const internalToken = Deno.env.get("ADMIN_ALERT_INTERNAL_TOKEN") || "";

  try {
    const body = (await req.json()) as AlertPayload;
    if (!internalToken || body.internal_token !== internalToken) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    if (!body.event_type || !body.message) {
      return new Response(JSON.stringify({ error: "event_type and message required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Resolve admin + manager recipients.
    const { data: roleRows, error: roleErr } = await admin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "manager"]);
    if (roleErr) throw roleErr;
    const recipientIds = Array.from(new Set((roleRows ?? []).map((r) => r.user_id as string)));
    if (recipientIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, recipients: 0 }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Load prefs for these recipients + this event across in_app/email channels.
    const { data: prefRows } = await admin
      .from("messaging_notification_prefs")
      .select("user_id, channel, enabled")
      .in("user_id", recipientIds)
      .eq("notification_type", body.event_type)
      .in("channel", ["in_app", "email"]);

    // Default: in_app = true when no row, email = false when no row.
    const prefFor = (userId: string, channel: "in_app" | "email"): boolean => {
      const row = (prefRows ?? []).find((p: any) => p.user_id === userId && p.channel === channel);
      if (row) return !!row.enabled;
      return channel === "in_app";
    };

    // Profiles for email fan-out.
    const { data: profileRows } = await admin
      .from("profiles")
      .select("user_id, email, full_name, preferred_language")
      .in("user_id", recipientIds);
    const profileById = new Map((profileRows ?? []).map((p: any) => [p.user_id, p]));

    const notifType = EVENT_TO_NOTIF_TYPE[body.event_type] ?? "override";
    const eventLabel = EVENT_LABELS[body.event_type] ?? body.event_type;
    const deepLinkAbsolute = body.deep_link
      ? (body.deep_link.startsWith("http") ? body.deep_link : `https://lmtcampstay.com${body.deep_link}`)
      : "https://lmtcampstay.com/";

    // 1) In-app fan-out.
    const inAppTargets = recipientIds.filter((uid) => prefFor(uid, "in_app"));
    if (inAppTargets.length > 0) {
      const rows = inAppTargets.map((uid) => ({
        user_id: uid,
        type: notifType,
        reference_id: body.reference_id ?? null,
        message: body.message,
      }));
      const { error: nerr } = await admin.from("notifications").insert(rows);
      if (nerr) console.error("[emit-admin-alert] notifications insert:", nerr);
    }

    // 2) Email fan-out (opt-in, uses the built-in email queue via send-transactional-email).
    const emailTargets = recipientIds.filter((uid) => prefFor(uid, "email"));
    let emailSent = 0;
    for (const uid of emailTargets) {
      const profile = profileById.get(uid);
      if (!profile?.email) continue;
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            template_key: "admin_alert_generic",
            recipient_email: profile.email,
            language: "en",
            data: {
              event_label: eventLabel,
              admin_alert_slug: body.event_type,
              recipient_name: profile.full_name || "Team",
              headline: eventLabel,
              summary: body.message,
              context: body.context ?? {},
              deep_link: deepLinkAbsolute,
            },
          }),
        });
        if (resp.ok) emailSent++;
        else console.error("[emit-admin-alert] send-transactional-email failed:", resp.status, await resp.text());
      } catch (e) {
        console.error("[emit-admin-alert] email dispatch error:", e);
      }
    }

    // 3) Best-effort push fan-out for in-app recipients that have a push subscription.
    if (inAppTargets.length > 0) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            user_ids: inAppTargets,
            title: `LMT CampStay — ${eventLabel}`,
            body: body.message,
            source: "admin-alert",
            data: { url: deepLinkAbsolute, type: body.event_type },
          }),
        });
      } catch (e) {
        console.warn("[emit-admin-alert] push dispatch failed:", e);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        event_type: body.event_type,
        recipients: recipientIds.length,
        in_app: inAppTargets.length,
        email_sent: emailSent,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("emit-admin-alert error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
