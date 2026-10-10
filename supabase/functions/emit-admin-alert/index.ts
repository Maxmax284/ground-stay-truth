// emit-admin-alert
// -----------------------------------------------------------------------------
// Admin Alert Command Center fan-out. Called by DB triggers (via
// public.emit_admin_alert) and by internal edge functions with the shared
// internal token.
//
// One operational event in → the system decides where it goes:
//   - in-app notification (bell)
//   - admin alert email (internal Lovable email engine)
//   - push (best effort, unchanged — reconnects later)
//
// Routing rules live in _shared/adminAlertCatalog.ts (mirrored in
// src/lib/adminAlertCatalog.ts). Per-admin overrides live in
// `messaging_notification_prefs`. Every email attempt is written to
// `admin_alert_log` for Operations Monitor visibility.
//
// GUEST SAFETY: this function never sends guest-facing email. It only ever
// emails users holding admin/manager roles, using the `admin_alert_generic`
// template. Admin preferences here can never block a transactional guest email.
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EVENTS_BY_KEY,
  PREF_CRITICAL_ONLY,
  PREF_EMAIL_MASTER,
  SEVERITY_PREFIX,
  passesCriticalOnly,
  type AdminAlertEvent,
} from "../_shared/adminAlertCatalog.ts";
import { sendAppEmail } from "../_shared/appEmail.ts";

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
  triggered_by?: string | null;
}

// Map catalog category → notification.type bucket used by the bell icons/sounds.
const CATEGORY_TO_NOTIF_TYPE: Record<string, string> = {
  bookings: "booking",
  payments: "payment",
  guest_portal: "message",
  rooms: "booking",
  maintenance: "override",
  email_delivery: "override",
  system: "override",
  operations: "booking",
  ai: "override",
  summary: "booking",
};

const SITE = "https://lmtcampstay.com";

// Suppression: at most N non-critical emails of the same event to the same
// admin inside the window. Critical alerts always go through.
const SUPPRESSION_WINDOW_MIN = 5;
const SUPPRESSION_MAX = 3;
const GUEST_MESSAGE_MAX = 8;

const FALLBACK_EVENT: AdminAlertEvent = {
  key: "unknown",
  label: "Operational event",
  description: "",
  category: "system",
  severity: "info",
  defaultEmail: false,
  defaultInApp: true,
  nextAction: "Open Operations Monitor for detail.",
  where: "Operations Monitor",
  wired: true,
};

// Human-friendly key names for the context table in the email.
function prettyKey(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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
    const event: AdminAlertEvent = EVENTS_BY_KEY[body.event_type] ?? {
      ...FALLBACK_EVENT,
      key: body.event_type,
      label: prettyKey(body.event_type),
    };
    const eventId = crypto.randomUUID();

    // ---------------------------------------------------------------- roles
    // On-duty responder mode: an urgent escalation addressed to ONE approved
    // responder (primary/backup) emails only that person. They already got the
    // in-app bell from the escalation job, so in-app is skipped below.
    const rawCtx = (body.context ?? {}) as Record<string, unknown>;
    const responderId = typeof rawCtx.responder_user_id === "string" ? rawCtx.responder_user_id : null;
    let recipientIds: string[];
    let responderMode = false;
    if (responderId && event.key.startsWith("urgent_guest_request")) {
      const { data: cap } = await admin
        .from("responder_capabilities")
        .select("user_id")
        .eq("user_id", responderId)
        .eq("can_receive_alerts", true)
        .limit(1);
      if (!cap || cap.length === 0) {
        return new Response(JSON.stringify({ ok: true, recipients: 0, reason: "not_approved_responder" }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      recipientIds = [responderId];
      responderMode = true;
      // Camp inbox is always in the loop: every admin account (e.g. the camp's
      // main admin inbox) gets the email too, so a responder dropping the ball
      // never leaves management blind. Practice drills stay isolated to the
      // responder so test pings never land in the live camp inbox.
      if (rawCtx.practice_drill !== true) {
        const { data: adminRows } = await admin
          .from("user_roles").select("user_id").eq("role", "admin");
        for (const r of adminRows ?? []) {
          if (!recipientIds.includes(r.user_id as string)) recipientIds.push(r.user_id as string);
        }
      }
    } else {
      const { data: roleRows, error: roleErr } = await admin
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "manager"]);
      if (roleErr) throw roleErr;
      recipientIds = Array.from(new Set((roleRows ?? []).map((r) => r.user_id as string)));
    }
    if (recipientIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, recipients: 0 }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ------------------------------------------------------------ preferences
    const { data: prefRows } = await admin
      .from("messaging_notification_prefs")
      .select("user_id, channel, notification_type, enabled")
      .in("user_id", recipientIds)
      .in("notification_type", [event.key, PREF_EMAIL_MASTER, PREF_CRITICAL_ONLY])
      .in("channel", ["in_app", "email"]);

    const pref = (userId: string, channel: string, type: string): boolean | undefined => {
      const row = (prefRows ?? []).find(
        (p: any) => p.user_id === userId && p.channel === channel && p.notification_type === type,
      );
      return row ? !!row.enabled : undefined;
    };

    const wantsInApp = (uid: string) => pref(uid, "in_app", event.key) ?? event.defaultInApp;
    const wantsEmail = (uid: string) => {
      const master = pref(uid, "email", PREF_EMAIL_MASTER) ?? true;
      if (!master) return false;
      const criticalOnly = pref(uid, "email", PREF_CRITICAL_ONLY) ?? false;
      if (criticalOnly && !passesCriticalOnly(event)) return false;
      return pref(uid, "email", event.key) ?? event.defaultEmail;
    };

    // --------------------------------------------------------------- profiles
    const { data: profileRows } = await admin
      .from("profiles")
      .select("user_id, email, full_name")
      .in("user_id", recipientIds);
    const profileById = new Map((profileRows ?? []).map((p: any) => [p.user_id, { ...p }]));
    // Staff-chosen alert inbox (Front Desk panel) wins over the login email.
    const { data: alertRows } = await admin
      .from("staff_alert_emails")
      .select("user_id, email, extra_emails")
      .in("user_id", recipientIds);
    const extraById = new Map<string, string[]>();
    for (const a of alertRows ?? []) {
      const p = profileById.get(a.user_id) ?? { user_id: a.user_id, full_name: null };
      profileById.set(a.user_id, { ...p, email: a.email });
      extraById.set(a.user_id, (a.extra_emails ?? []).filter((e: string) => e && e !== a.email));
    }

    const notifType = CATEGORY_TO_NOTIF_TYPE[event.category] ?? "override";
    const deepLinkAbsolute = body.deep_link
      ? (body.deep_link.startsWith("http") ? body.deep_link : `${SITE}${body.deep_link}`)
      : `${SITE}/monitoring`;
    const ctx = (body.context ?? {}) as Record<string, unknown>;
    const bookingId =
      (typeof ctx.booking_id === "string" ? ctx.booking_id : null) ??
      (body.reference_id && event.category !== "system" ? body.reference_id : null);
    const guestId = typeof ctx.guest_id === "string" ? ctx.guest_id : null;

    // ------------------------------------------------------- 1) in-app fan-out
    // Responder already got the bell from the escalation job — don't double it.
    const inAppTargets = recipientIds.filter(
      (uid) => wantsInApp(uid) && !(responderMode && uid === responderId),
    );
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

    // -------------------------------------------------- 2) admin email fan-out
    const emailCandidates = recipientIds.filter(wantsEmail);
    const isCritical = event.severity === "critical";
    const since = new Date(Date.now() - SUPPRESSION_WINDOW_MIN * 60_000).toISOString();

    let emailSent = 0;
    let emailFailed = 0;
    let suppressed = 0;

    const nowLabel = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short",
    }).format(new Date());

    for (const uid of emailCandidates) {
     const baseProfile = profileById.get(uid);
     if (!baseProfile?.email) continue;
     const addrs = [baseProfile.email, ...(extraById.get(uid) ?? [])];
     for (let ai = 0; ai < addrs.length; ai++) {
      const profile = { ...baseProfile, email: addrs[ai] };
      const keySuffix = ai === 0 ? uid : `${uid}-${ai}`;

      // Anti-spam: critical bypasses, everything else is rate limited.
      // Guest messages are counted per booking (one chatty guest can't mute
      // another) with a higher cap, so "I've landed" + "I'm here" never
      // swallow the guest's next real message.
      if (!isCritical) {
        const perBooking = event.key === "guest_message_received" && !!bookingId;
        let q = admin
          .from("admin_alert_log")
          .select("id", { count: "exact", head: true })
          .eq("recipient_user_id", uid)
          .eq("recipient_email", profile.email)
          .eq("event_type", event.key)
          .eq("channel", "email")
          .eq("status", "sent")
          .gte("created_at", since);
        if (perBooking) q = q.eq("booking_id", bookingId!);
        const { count } = await q;
        const cap = perBooking ? GUEST_MESSAGE_MAX : SUPPRESSION_MAX;
        if ((count ?? 0) >= cap) {
          suppressed++;
          await admin.from("admin_alert_log").insert({
            event_id: eventId, event_type: event.key, category: event.category,
            severity: event.severity, channel: "email", recipient_user_id: uid,
            recipient_email: profile.email, status: "suppressed",
            failure_reason: `Rate limited: more than ${SUPPRESSION_MAX} in ${SUPPRESSION_WINDOW_MIN} min`,
            booking_id: bookingId, guest_id: guestId,
            triggered_by: body.triggered_by ?? "system", template_key: "admin_alert_generic",
          });
          continue;
        }
      }

      const drillTag = rawCtx.practice_drill === true ? "[PRACTICE DRILL] " : "";
      const subject = `${drillTag}${SEVERITY_PREFIX[event.severity]} ${event.label}`;
      let ok = false;
      let failure: string | null = null;
      let skipped = false;
      try {
        const result = await sendAppEmail({
          templateName: "admin_alert_generic",
          recipientEmail: profile.email,
          language: "en",
          source: "admin-alert",
          bookingId,
          // One key per (event, recipient). Never share a key across the
          // fan-out — a shared key gets every recipient after the first
          // rejected with 403 recipient_mismatch.
          idempotencyKey: typeof ctx.dedupe_key === "string" ? `alert-${ctx.dedupe_key}-${keySuffix}` : `alert-${eventId}-${keySuffix}`,

          templateData: {
            subject_line: subject,
            severity: event.severity,
            severity_label: event.severity,
            category_label: event.label,
            recipient_name: profile.full_name || "Team",
            what_happened: body.message,
            when_label: `${nowLabel} (Bangkok time)`,
            where_label: event.where,
            why_it_matters: event.description,
            next_action: event.nextAction,
            context: Object.fromEntries(
              Object.entries(ctx)
                .filter(([k]) => !/token|secret|url|key|password/i.test(k))
                .slice(0, 10)
                .map(([k, v]) => [prettyKey(k), v]),
            ),
            action_url: deepLinkAbsolute,
            action_label: "Open in CampStay",
          },
        });
        ok = result.sent;
        if (!ok) {
          if (!("error" in result) && result.reason === "sandbox") skipped = true;
          failure =
            "error" in result
              ? String(result.error).slice(0, 300)
              : `not sent: ${result.reason}`;
        }
      } catch (e) {
        failure = e instanceof Error ? e.message : "dispatch error";
      }

      // Held back on purpose (test/sandbox booking) is not a delivery failure.
      if (ok) emailSent++; else if (!skipped) emailFailed++;
      await admin.from("admin_alert_log").insert({
        event_id: eventId, event_type: event.key, category: event.category,
        severity: event.severity, channel: "email", recipient_user_id: uid,
        recipient_email: profile.email, status: ok ? "sent" : skipped ? "skipped" : "failed",
        failure_reason: failure, booking_id: bookingId, guest_id: guestId,
        triggered_by: body.triggered_by ?? "system", template_key: "admin_alert_generic",
      });
     }
    }

    // --------------------------------------------- 3) push (best effort, as-is)
    if (inAppTargets.length > 0) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({
            user_ids: inAppTargets,
            title: `LMT CampStay — ${event.label}`,
            body: body.message,
            source: "admin-alert",
            data: { url: deepLinkAbsolute, type: event.key },
          }),
        });
      } catch (e) {
        console.warn("[emit-admin-alert] push dispatch failed:", e);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        event_id: eventId,
        event_type: event.key,
        severity: event.severity,
        category: event.category,
        recipients: recipientIds.length,
        in_app: inAppTargets.length,
        email_sent: emailSent,
        email_failed: emailFailed,
        email_suppressed: suppressed,
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
