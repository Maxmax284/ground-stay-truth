// notify-guest-message
// -----------------------------------------------------------------------------
// Fallback rail for a guest-visible staff reply. Called fire-and-forget by the
// app right after the message row is written, with the staff member's own JWT.
//
// Order of delivery attempts:
//   1. WhatsApp, if the guest has a number AND the connector is linked.
//        TODO(connector): link the Lovable WhatsApp Business connector —
//        see _shared/messagingConnector.ts. Until then this step reports
//        "connector_not_linked" and we go straight to email.
//   2. Email, debounced: at most one notice per booking per DEBOUNCE_MINUTES,
//      so a staff member firing off five lines doesn't send five emails.
//
// The message itself is already saved. This function only notifies — it never
// writes to bookings, payments, pickups or check-in state, and it never blocks
// the staff member's send.
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAppEmail } from "../_shared/appEmail.ts";
import { sendGuestWhatsApp, whatsAppConnectorLinked } from "../_shared/messagingConnector.ts";
import { emitAdminAlert } from "../_shared/adminAlert.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
};

const DEBOUNCE_MINUTES = 10;
const SITE = "https://lmtcampstay.com";
const TEMPLATE = "guest_message_notice";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const { booking_id, message_id } = (await req.json()) as {
      booking_id?: string;
      message_id?: string;
    };
    if (!booking_id) return json({ error: "booking_id required" }, 400);

    const admin = createClient(url, serviceKey);

    // Caller must be a signed-in staff member; guests can't trigger notices.
    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: caller } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (!caller?.user) return json({ error: "unauthorized" }, 401);
    const { data: callerRoles } = await admin
      .from("user_roles").select("role").eq("user_id", caller.user.id);
    const staffRoles = ["admin", "manager", "front_desk_supervisor", "front_desk", "maintenance"];
    const callerIsStaff = (callerRoles ?? []).some((r: { role: string }) => staffRoles.includes(r.role));

    // ── Guest-sent message: the DB trigger (alert_guest_message) already
    // alerts the camp on insert. Emitting here too doubled every email.
    if (!callerIsStaff) {
      const { data: gm } = await admin
        .from("messages").select("id, booking_id, sender_id")
        .eq("id", message_id ?? "").maybeSingle();
      const { data: gb } = await admin
        .from("bookings").select("id, guest_id").eq("id", booking_id).maybeSingle();
      if (!gm || !gb || gm.booking_id !== booking_id || gb.guest_id !== caller.user.id || gm.sender_id !== caller.user.id) {
        return json({ error: "forbidden" }, 403);
      }
      return json({ ok: true, direction: "guest_to_camp", alerted: "via_db_trigger" });
    }

    // The message we're announcing, and who it belongs to.
    const { data: message } = await admin
      .from("messages")
      .select("id, booking_id, content, is_internal, created_at")
      .eq("id", message_id ?? "")
      .maybeSingle();
    if (message?.is_internal) return json({ ok: true, skipped: "internal_note" });

    const { data: booking } = await admin
      .from("bookings")
      .select("id, guest_id, manual_guest_email, manual_guest_phone, units(name)")
      .eq("id", booking_id)
      .maybeSingle();
    if (!booking) return json({ error: "booking not found" }, 404);

    let guestEmail = booking.manual_guest_email as string | null;
    let guestPhone = booking.manual_guest_phone as string | null;
    let guestName: string | null = null;
    let language = "en";
    if (booking.guest_id) {
      const { data: profile } = await admin
        .from("profiles")
        .select("email, full_name, phone, whatsapp, preferred_language")
        .eq("user_id", booking.guest_id)
        .maybeSingle();
      guestEmail = profile?.email ?? guestEmail;
      guestPhone = (profile?.whatsapp as string | null) ?? (profile?.phone as string | null) ?? guestPhone;
      guestName = (profile?.full_name as string | null) ?? null;
      language = (profile?.preferred_language as string | null) ?? "en";
    }

    const { data: senderProfile } = await admin
      .from("profiles").select("full_name").eq("user_id", caller.user.id).maybeSingle();
    const staffName = (senderProfile?.full_name as string | null) ?? "Front desk";
    const unitName = (booking as { units?: { name?: string } | null }).units?.name ?? null;
    const body = (message?.content ?? "").trim();
    const snippet = body.length > 300 ? `${body.slice(0, 300)}…` : body;

    // ── 1. WhatsApp (connector seam) ─────────────────────────────────────────
    const whatsapp = await sendGuestWhatsApp(
      guestPhone,
      `Lamai Camp — ${staffName}:\n${snippet}\n\nReply here or open your portal: ${SITE}/guest`,
    );

    // ── 2. Email, debounced per booking ──────────────────────────────────────
    let email: Record<string, unknown> = { attempted: false };
    if (guestEmail) {
      const since = new Date(Date.now() - DEBOUNCE_MINUTES * 60_000).toISOString();
      const { data: recent } = await admin
        .from("email_send_log")
        .select("id")
        .eq("template_name", TEMPLATE)
        .eq("status", "sent")
        .eq("recipient_email", guestEmail)
        .gte("created_at", since)
        .limit(1);
      if (recent && recent.length > 0) {
        email = { attempted: false, skipped: "debounced" };
      } else {
        const result = await sendAppEmail({
          templateName: TEMPLATE,
          recipientEmail: guestEmail,
          language,
          bookingId: booking_id,
          source: "guest-message-notice",
          triggeredBy: caller.user.id,
          idempotencyKey: `guest-msg-${message?.id ?? crypto.randomUUID()}-${guestEmail.toLowerCase()}`,
          templateData: {
            guest_name: guestName?.split(" ")[0] ?? null,
            staff_name: staffName,
            unit_name: unitName,
            snippet,
            portal_url: `${SITE}/guest`,
          },
        });
        email = { attempted: true, ...result };
      }
    } else {
      email = { attempted: false, skipped: "no_email_on_file" };
    }

    // ── Quiet admin visibility on staff replies (alert centre caps + settings) ──
    await emitAdminAlert(
      "staff_replied_to_guest",
      `${staffName} → ${guestName ?? "guest"}${unitName ? ` (${unitName})` : ""}: "${snippet.slice(0, 200)}"`,
      { referenceId: booking_id, deepLink: "/messages", context: { channel: "portal" }, triggeredBy: caller.user.id },
    );

    return json({
      ok: true,
      whatsapp,
      whatsapp_connector_linked: whatsAppConnectorLinked(),
      email,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown";
    console.error("notify-guest-message error:", detail);
    return json({ error: detail }, 500);
  }
});
