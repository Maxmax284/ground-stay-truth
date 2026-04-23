// notify-via-messaging — single outbound pipeline for messaging-bridge notifications.
//
// Resolves users to notify based on event_type + role mapping, checks per-user
// notification preferences (messaging_notification_prefs), and dispatches to
// Telegram (sendMessage) and/or Twilio (SMS / WhatsApp via Messages.json).
//
// Invoked from:
// - Client hooks (booking transitions, payments, etc.) using the user's JWT
// - Other edge functions (server-to-server with service-role key)
//
// Payload:
//   {
//     event_type: "booking_state_change" | "payment_received" | ...,
//     subject_id: uuid,                  // booking_id, payment_id, etc.
//     metadata: { ... },                 // free-form context for message text
//     target_user_ids?: uuid[],          // optional explicit list
//     target_roles?: string[],           // optional role filter
//     guest_user_id?: uuid               // if guest also gets a copy
//   }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildFlexForEvent, type LineLang } from "../_shared/lineFlex.ts";
import {
  buildTelegramForEvent,
  buildWhatsAppForEvent,
  whatsAppIntentToText,
  type RichLang,
  type Role,
} from "../_shared/richMessages.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map event types -> roles whose default-prefs should fire
const EVENT_ROLE_MAP: Record<string, string[]> = {
  booking_approval_needed: ["admin"],
  new_inquiry: ["admin", "manager"],
  booking_state_change: ["manager"],
  booking_approved: ["front_desk_supervisor"],
  payment_received: ["admin", "manager"],
  payment_failed: ["admin", "manager"],
  new_review: ["admin"],
  security_alert: ["admin"],
  checkin_due: ["front_desk_supervisor"],
  checkout_due: ["front_desk_supervisor"],
  assigned_booking_update: ["front_desk"],
  guest_arrival_change: ["front_desk"],
  task_assigned: ["maintenance"],
  urgent_issue: ["maintenance"],
  daily_briefing: ["admin", "manager"],
  // Operational state events
  security_deposit_held: ["admin"],
  security_deposit_deducted: ["admin"],
  security_deposit_released: ["admin"],
  room_ready: ["front_desk_supervisor", "front_desk"],
  // Guest-targeted
  booking_confirmed: ["guest"],
  payment_receipt: ["guest"],
  checkin_instructions_24h: ["guest"],
  deposit_status_update: ["guest"],
  room_ready_guest: ["guest"],
  // Arrival journey — guest-targeted
  arrival_stage_1_guest: ["guest"],
  arrival_stage_2_guest: ["guest"],
  arrival_stage_3_guest: ["guest"],
  arrival_stage_4_guest: ["guest"],
  // Arrival journey — staff-targeted (use target_roles override on dispatch)
  arrival_stage_1_staff: ["admin", "manager", "front_desk_supervisor", "front_desk"],
  arrival_stage_2_staff: ["admin", "front_desk_supervisor", "front_desk"],
  arrival_stage_3_staff: ["front_desk_supervisor", "front_desk"],
  arrival_stage_3_driver: [], // explicit target_user_ids only
  arrival_stage_4_staff: ["front_desk_supervisor", "front_desk"],
  arrival_stage_4_vip: ["admin"],
};

interface Payload {
  event_type: string;
  subject_id?: string;
  metadata?: Record<string, unknown>;
  target_user_ids?: string[];
  target_roles?: string[];
  guest_user_id?: string;
}

// ── Channel senders ──

async function sendTelegram(
  admin: any,
  chatId: string,
  text: string,
  rich?: { text: string; parse_mode: "MarkdownV2"; reply_markup?: any; plainText: string } | null,
): Promise<{ ok: boolean; error?: string }> {
  const { data: tokenRow } = await admin
    .from("integration_secrets")
    .select("encrypted_value")
    .eq("secret_key", "telegram_bot_token")
    .maybeSingle();
  if (!tokenRow?.encrypted_value) return { ok: false, error: "telegram_bot_token not configured" };

  const url = `https://api.telegram.org/bot${tokenRow.encrypted_value}/sendMessage`;

  // Try rich (MarkdownV2 + inline_keyboard) first if provided.
  if (rich) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: rich.text,
        parse_mode: rich.parse_mode,
        disable_web_page_preview: true,
        reply_markup: rich.reply_markup,
      }),
    });
    if (r.ok) return { ok: true };
    // Telegram MarkdownV2 is strict — on parse failure, fall through to plain.
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: rich?.plainText ?? text, disable_web_page_preview: true }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    return { ok: false, error: `telegram ${resp.status}: ${body.slice(0, 200)}` };
  }
  return { ok: true };
}

async function sendLine(
  admin: any,
  chatId: string,
  text: string,
  flexMessage: any | null,
): Promise<{ ok: boolean; error?: string }> {
  const { data: tokenRow } = await admin
    .from("integration_secrets")
    .select("encrypted_value")
    .eq("secret_key", "line_channel_access_token")
    .maybeSingle();
  if (!tokenRow?.encrypted_value) return { ok: false, error: "line_channel_access_token not configured" };

  // Prefer rich Flex when available; LINE auto-falls-back to altText on
  // unsupported clients / push notification previews.
  const messages = flexMessage
    ? [flexMessage]
    : [{ type: "text", text: text.slice(0, 5000) }];

  // LINE push message — counts against the channel's monthly free quota.
  const resp = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenRow.encrypted_value}`,
    },
    body: JSON.stringify({ to: chatId, messages }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    // If Flex was rejected (rare schema issue), fall back to plain text once.
    if (flexMessage) {
      const retry = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRow.encrypted_value}`,
        },
        body: JSON.stringify({ to: chatId, messages: [{ type: "text", text: text.slice(0, 5000) }] }),
      });
      if (retry.ok) return { ok: true };
    }
    return { ok: false, error: `line ${resp.status}: ${body.slice(0, 200)}` };
  }
  return { ok: true };
}

async function sendTwilio(
  admin: any,
  channel: "sms" | "whatsapp",
  toNumber: string,
  text: string,
  waIntent?: import("../_shared/richMessages.ts").WhatsAppIntent | null,
): Promise<{ ok: boolean; error?: string }> {
  const [{ data: sidRow }, { data: tokenRow }, { data: smsFromRow }, { data: waFromRow }] = await Promise.all([
    admin.from("integration_secrets").select("encrypted_value").eq("secret_key", "twilio_account_sid").maybeSingle(),
    admin.from("integration_secrets").select("encrypted_value").eq("secret_key", "twilio_auth_token").maybeSingle(),
    admin.from("integration_secrets").select("encrypted_value").eq("secret_key", "twilio_sms_from").maybeSingle(),
    admin.from("integration_secrets").select("encrypted_value").eq("secret_key", "twilio_whatsapp_from").maybeSingle(),
  ]);
  if (!sidRow?.encrypted_value || !tokenRow?.encrypted_value) return { ok: false, error: "twilio not configured" };
  const sid = sidRow.encrypted_value;
  const fromRaw = (channel === "sms" ? smsFromRow?.encrypted_value : waFromRow?.encrypted_value);
  if (!fromRaw) return { ok: false, error: `twilio_${channel}_from not configured` };

  const from = channel === "whatsapp" ? `whatsapp:${fromRaw}` : fromRaw;
  const to = channel === "whatsapp" && !toNumber.startsWith("whatsapp:") ? `whatsapp:${toNumber}` : toNumber;

  const auth = btoa(`${sid}:${tokenRow.encrypted_value}`);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  // ── WhatsApp rich-format path ─────────────────────────────────────────
  // Twilio's WhatsApp interactive messages (Reply Buttons / List Messages)
  // require a pre-approved Content Template SID. If the org has configured a
  // Content SID for this intent kind in integration_secrets, use it. Otherwise
  // we still upgrade the presentation by attaching media (for media intents)
  // or sending a clearly numbered options text (matches the human-voice rules
  // and is fully WhatsApp-compatible without templates).
  if (channel === "whatsapp" && waIntent) {
    if (waIntent.kind === "media") {
      const r = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: from, Body: waIntent.caption.slice(0, 1500), MediaUrl: waIntent.mediaUrl }),
      });
      if (r.ok) return { ok: true };
      // Fall through to plain text on failure.
    } else {
      // Look for an org-configured Content Template SID for this intent kind.
      const sidKey = waIntent.kind === "reply_buttons"
        ? "twilio_wa_content_sid_reply_buttons"
        : "twilio_wa_content_sid_list";
      const { data: contentRow } = await admin
        .from("integration_secrets").select("encrypted_value").eq("secret_key", sidKey).maybeSingle();
      const contentSid = contentRow?.encrypted_value;
      if (contentSid) {
        // Variables passed positionally; template owner controls layout.
        const vars: Record<string, string> = { "1": waIntent.body.slice(0, 1024) };
        if (waIntent.kind === "reply_buttons") {
          waIntent.buttons.slice(0, 3).forEach((b, i) => { vars[String(i + 2)] = b.label.slice(0, 24); });
        } else {
          // First 9 list items as variables 2..10.
          const flat = waIntent.sections.flatMap((s) => s.items).slice(0, 9);
          flat.forEach((it, i) => { vars[String(i + 2)] = it.title.slice(0, 24); });
        }
        const r = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ To: to, From: from, ContentSid: contentSid, ContentVariables: JSON.stringify(vars) }),
        });
        if (r.ok) return { ok: true };
        // Fall through to structured plain-text fallback.
      }
      // No template configured (or template send failed) — send numbered text
      // representation so the upgrade still beats a plain wall of text.
      const fallback = whatsAppIntentToText(waIntent);
      const r = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: from, Body: fallback.slice(0, 1500) }),
      });
      if (r.ok) return { ok: true };
      const body = await r.text();
      return { ok: false, error: `twilio ${r.status}: ${body.slice(0, 200)}` };
    }
  }

  // ── SMS / WhatsApp plain-text path (unchanged) ────────────────────────
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: text }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    return { ok: false, error: `twilio ${resp.status}: ${body.slice(0, 200)}` };
  }
  return { ok: true };
}

// ── Message text builder ──
function buildMessage(eventType: string, metadata: Record<string, unknown>): string {
  const m = metadata as any;
  switch (eventType) {
    case "booking_state_change":
      return `Booking update: ${m.guest_name ?? "Guest"} (${m.unit_name ?? "Unit"}) → ${m.to_state ?? "?"}.${m.reason ? ` Note: ${String(m.reason).slice(0, 120)}` : ""}`;
    case "booking_approval_needed":
      return `Approval needed: ${m.guest_name ?? "Guest"} for ${m.unit_name ?? "Unit"} on ${m.check_in ?? "?"}.`;
    case "booking_approved":
      return `Approved: ${m.guest_name ?? "Guest"} → ${m.unit_name ?? "Unit"} (${m.check_in ?? "?"}).`;
    case "new_inquiry":
      return `New inquiry: ${m.guest_name ?? "?"} for ${m.unit_name ?? "Unit"}, ${m.check_in ?? "?"} → ${m.check_out ?? "?"}.`;
    case "payment_received":
      return `Payment received: ${m.amount ?? "?"} for ${m.guest_name ?? "booking"} (${m.method ?? "?"}).`;
    case "payment_receipt":
      return `Payment confirmed — ${m.amount ?? "?"} received for your booking. Thanks!`;
    case "new_review":
      return `New review (${m.rating ?? "?"}★): "${String(m.title ?? "").slice(0, 80)}"`;
    case "security_alert":
      return `Security alert: ${m.event_type ?? "?"} [${m.severity ?? "?"}].`;
    case "checkin_due":
      return `Check-in due today: ${m.guest_name ?? "Guest"} → ${m.unit_name ?? "Unit"}.`;
    case "checkout_due":
      return `Check-out due today: ${m.guest_name ?? "Guest"} ← ${m.unit_name ?? "Unit"}.`;
    case "assigned_booking_update":
      return `Booking update: ${m.guest_name ?? "Guest"} (${m.unit_name ?? "Unit"}) — ${m.detail ?? "see app"}.`;
    case "guest_arrival_change":
      return `Arrival change: ${m.guest_name ?? "Guest"} — ${m.detail ?? "see app"}.`;
    case "task_assigned":
      return `Task assigned: ${m.unit_name ?? "Unit"} — ${m.detail ?? "see app"}.`;
    case "urgent_issue":
      return `URGENT: ${m.unit_name ?? "Unit"} — ${m.detail ?? "see app"}.`;
    case "daily_briefing":
      return `Daily briefing: ${m.summary ?? "see app"}.`;
    case "booking_confirmed":
      return `Your booking is confirmed: ${m.unit_name ?? "Unit"}, ${m.check_in ?? "?"} → ${m.check_out ?? "?"}. See you soon.`;
    case "checkin_instructions_24h":
      return `Check-in tomorrow: ${m.unit_name ?? "Unit"} from ${m.checkin_time ?? "16:00"}. Open the app for full instructions.`;
    case "payment_failed":
      return `Payment failed: ${m.guest_name ?? "Guest"} (${m.amount ?? "?"}) — ${m.reason ?? "see app"}.`;
    case "security_deposit_held":
      return `Deposit held: ${m.amount ?? "?"} for ${m.guest_name ?? "Guest"} (${m.unit_name ?? "Unit"}).`;
    case "security_deposit_deducted":
      return `Deposit deducted: ${m.amount ?? "?"} from ${m.guest_name ?? "Guest"}. Reason: ${String(m.reason ?? "see app").slice(0, 120)}`;
    case "security_deposit_released":
      return `Deposit released: ${m.amount ?? "?"} back to ${m.guest_name ?? "Guest"}.`;
    case "deposit_status_update":
      return `Your security deposit is now ${m.status ?? "updated"}${m.amount_deducted ? ` (${m.amount_deducted} deducted: ${String(m.reason ?? "").slice(0, 80)})` : ""}.`;
    case "room_ready":
      return `Room ready: ${m.unit_name ?? "Unit"} cleaned and ready for ${m.next_guest_name ?? "next arrival"}.`;
    case "room_ready_guest":
      return `Good news — your room (${m.unit_name ?? "Unit"}) is ready. See you soon.`;
    // Arrival journey — guest
    case "arrival_stage_1_guest":
      return `Tomorrow's the day 🎒 Check-in from ${m.check_in_time ?? "16:00"} at ${m.property_name ?? "the property"}${m.address ? ` (${String(m.address).slice(0, 80)})` : ""}. Bring ID + booking ref. I'm Kru Glitch — message me anytime if you need anything.`;
    case "arrival_stage_2_guest":
      return `Welcome to Thailand 🇹🇭 What's your plan to the island — flight, ferry, or transfer? Just reply and I'll line up the next steps.`;
    case "arrival_stage_3_guest":
      return `Almost there! Property: ${m.unit_name ?? "your unit"}${m.address ? ` — ${String(m.address).slice(0, 100)}` : ""}. Front desk knows you're inbound. See you soon.`;
    case "arrival_stage_4_guest":
      return `You're checked in 🥊 Unit: ${m.unit_name ?? "yours"}.${m.wifi ? ` WiFi: ${m.wifi}.` : ""} I'm Kru Glitch — message me anytime for food, transport, training, or anything you need.`;
    // Arrival journey — staff
    case "arrival_stage_1_staff":
      return `Tomorrow's arrivals (${m.count ?? 0}):\n${m.summary ?? "—"}`;
    case "arrival_stage_2_staff":
      return `${m.guest_name ?? "Guest"} has landed at BKK${m.flight ? ` (${m.flight})` : ""}.`;
    case "arrival_stage_3_staff":
      return `${m.guest_name ?? "Guest"} → ${m.unit_name ?? "Unit"} — ${m.eta_minutes === 0 ? "arrived on island, imminent arrival" : `ETA ~${m.eta_minutes ?? 30} min`}.`;
    case "arrival_stage_3_driver":
      return `Pickup confirmation: ${m.guest_name ?? "Guest"} → ${m.unit_name ?? "Unit"}. Guest is on the way.`;
    case "arrival_stage_4_staff":
      return `Check-in confirmed: ${m.unit_name ?? "Unit"}.`;
    case "arrival_stage_4_vip":
      return `⭐ VIP check-in: ${m.unit_name ?? "Unit"}. Heads-up.`;
    default:
      return `${eventType}${m.detail ? `: ${m.detail}` : ""}`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const payload = (await req.json()) as Payload;
    const { event_type, subject_id, metadata = {}, target_user_ids, target_roles, guest_user_id } = payload;

    if (!event_type) {
      return new Response(JSON.stringify({ error: "event_type required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve recipients
    let recipientUserIds = new Set<string>();

    if (target_user_ids?.length) {
      target_user_ids.forEach((id) => recipientUserIds.add(id));
    }

    const rolesToTarget = target_roles?.length ? target_roles : EVENT_ROLE_MAP[event_type];
    if (rolesToTarget?.length && !rolesToTarget.includes("guest")) {
      const { data: roleRows } = await admin
        .from("user_roles")
        .select("user_id")
        .in("role", rolesToTarget);
      (roleRows ?? []).forEach((r: any) => recipientUserIds.add(r.user_id));
    }

    if (guest_user_id) recipientUserIds.add(guest_user_id);

    if (recipientUserIds.size === 0) {
      return new Response(JSON.stringify({ ok: true, dispatched: 0, note: "no recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch bindings + per-user prefs + profile language in one shot
    const userIds = Array.from(recipientUserIds);
    const [{ data: bindings }, { data: prefs }, { data: profileRows }] = await Promise.all([
      admin.from("messaging_chat_bindings").select("user_id, channel, chat_id").in("user_id", userIds),
      admin.from("messaging_notification_prefs").select("user_id, channel, notification_type, enabled")
        .in("user_id", userIds).eq("notification_type", event_type),
      admin.from("profiles").select("user_id, preferred_language").in("user_id", userIds),
    ]);
    const langByUser = new Map<string, LineLang>();
    (profileRows ?? []).forEach((p: any) => {
      const l = (p.preferred_language ?? "en").slice(0, 2).toLowerCase();
      langByUser.set(p.user_id, l as LineLang);
    });

    const text = buildMessage(event_type, metadata);
    const dispatched: any[] = [];
    const logRows: any[] = [];

    for (const b of bindings ?? []) {
      // Check pref: must exist and be enabled. Default: skip (no spam).
      const pref = (prefs ?? []).find(
        (p: any) => p.user_id === b.user_id && p.channel === b.channel
      );
      if (!pref || pref.enabled === false) continue;

      let result: { ok: boolean; error?: string };
      if (b.channel === "telegram") {
        result = await sendTelegram(admin, b.chat_id, text);
      } else if (b.channel === "sms" || b.channel === "whatsapp") {
        result = await sendTwilio(admin, b.channel, b.chat_id, text);
      } else if (b.channel === "line") {
        // Presentation upgrade only — text fallback unchanged.
        const lang = langByUser.get(b.user_id) ?? "en";
        const flex = buildFlexForEvent(event_type, metadata as Record<string, any>, lang);
        result = await sendLine(admin, b.chat_id, text, flex);
      } else {
        result = { ok: false, error: `unknown channel: ${b.channel}` };
      }

      logRows.push({
        user_id: b.user_id,
        channel: b.channel,
        chat_id: b.chat_id,
        notification_type: event_type,
        subject_id: subject_id ?? null,
        outcome: result.ok ? "sent" : "failed",
        error: result.error ?? null,
      });
      if (result.ok) dispatched.push({ user_id: b.user_id, channel: b.channel });
    }

    if (logRows.length) {
      await admin.from("messaging_notification_log").insert(logRows);
    }

    return new Response(JSON.stringify({ ok: true, dispatched: dispatched.length, total: bindings?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-via-messaging error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
