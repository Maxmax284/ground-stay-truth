// Shared dispatch for inbound messages from Telegram, WhatsApp, and SMS.
// Resolves chat_id -> linked Lovable user, derives role from user_roles,
// runs Kru Glitch via the AI gateway, optionally translates to user's
// preferred language, and returns the reply text + outbound channel info.
//
// Capture-only: never mutates bookings, payments, or guest-facing surfaces.
// Staff `/note <text>` writes an internal-only note on their last booking.
//
// This function is invoked SERVER-TO-SERVER by telegram-poll and twilio-webhook
// using the service-role key. It is not meant to be called from the browser.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ROLE_PRIORITY: Record<string, number> = {
  admin: 100, manager: 90, front_desk_supervisor: 80,
  front_desk: 70, maintenance: 60, viewer: 50, guest: 10,
};

const LANG_NAMES: Record<string, string> = {
  en: "English", th: "Thai", de: "German", fr: "French",
  ru: "Russian", zh: "Chinese", ja: "Japanese", ko: "Korean", es: "Spanish",
};

function deriveRole(roles: { role: string }[]): string {
  if (!roles?.length) return "guest";
  return roles.sort((a, b) => (ROLE_PRIORITY[b.role] ?? 0) - (ROLE_PRIORITY[a.role] ?? 0))[0].role;
}

function isStaffRole(role: string): boolean {
  return ["admin", "manager", "front_desk_supervisor", "front_desk", "maintenance"].includes(role);
}

// Warm, brief Kru Glitch persona — capture-only, channel-aware.
function buildSystemPrompt(role: string, language: string, channel: string, displayName: string): string {
  const channelLabel = channel === "sms" ? "SMS" : channel === "whatsapp" ? "WhatsApp" : "Telegram";
  const base = `You are Kru Glitch, the resident advisor at Ground Stay (a Muay Thai fight camp + accommodation in Koh Samui).
You are speaking to ${displayName} over ${channelLabel}. This is a chat bridge — keep replies short and warm, max 3 short sentences. No markdown, no headers, plain text only (chat clients show it raw).

CAPTURE-ONLY MODE:
- You can answer questions, share local intel, and confirm what's happening.
- You CANNOT modify bookings, approve requests, record payments, or promise outcomes.
- If something needs staff action, say: "I'll flag this for staff." That's it — no elaboration.

LANGUAGE: Respond in ${language}.`;

  if (isStaffRole(role)) {
    return base + `

ROLE: Staff (${role}). You can discuss operational intel, today's pickups, units, and bookings at a high level. Do NOT expose payment amounts to front_desk; supervisors and above can confirm payment existence but not details unless asked.
TIP: They can send "/note <text>" to capture an internal note on their last booking. Don't mention this unless they seem to be trying.`;
  }

  return base + `

ROLE: Guest concierge. Only discuss this guest's own stay. If asked about anything else: "I don't have access to that — front desk can help." Lead with what they need RIGHT NOW.`;
}

// Pull a small, role-appropriate context snapshot.
async function buildContext(admin: any, userId: string, role: string): Promise<string> {
  if (!isStaffRole(role)) {
    // Guest: their bookings only
    const { data: bookings } = await admin
      .from("bookings")
      .select("state, check_in, check_out, units(name)")
      .eq("guest_id", userId)
      .order("check_in", { ascending: true })
      .limit(3);
    if (!bookings?.length) return "GUEST CONTEXT: No active bookings on file.";
    const lines = bookings.map((b: any) =>
      `- ${b.units?.name ?? "Unit"}: ${b.check_in} → ${b.check_out} (${b.state})`
    );
    return `GUEST CONTEXT (your bookings):\n${lines.join("\n")}`;
  }
  // Staff: brief operational snapshot
  const [unitsRes, bookingsRes, intelRes] = await Promise.all([
    admin.from("units").select("name").eq("is_active", true).limit(20),
    admin.from("bookings").select("state").in("state", ["confirmed", "checked_in", "pending_approval", "pending_deposit"]),
    admin.from("intelligence_entries").select("title, body").eq("status", "active").contains("audience", ["staff"]).limit(5),
  ]);
  const states = (bookingsRes.data ?? []).reduce((acc: Record<string, number>, b: any) => {
    acc[b.state] = (acc[b.state] || 0) + 1; return acc;
  }, {});
  const intelLines = (intelRes.data ?? []).map((i: any) =>
    `- ${i.title}: ${String(i.body).slice(0, 160)}`
  ).join("\n");
  return `STAFF CONTEXT:
Active units: ${(unitsRes.data ?? []).map((u: any) => u.name).join(", ") || "none"}.
Booking pipeline: ${Object.entries(states).map(([s, n]) => `${s}=${n}`).join(", ") || "empty"}.
Recent staff intel:
${intelLines || "(none active)"}`;
}

async function callAI(systemPrompt: string, userText: string, lovableApiKey: string): Promise<string> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      max_tokens: 400,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("AI gateway error", resp.status, t);
    if (resp.status === 429) return "I'm getting a lot of messages right now — give me a minute and try again.";
    if (resp.status === 402) return "AI credits are out — front desk has been notified.";
    throw new Error(`AI gateway ${resp.status}`);
  }
  const json = await resp.json();
  return (json.choices?.[0]?.message?.content || "").trim();
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500 });
    }

    // Internal token check — only the polling/webhook functions may call us.
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const internalToken = req.headers.get("x-internal-bridge");
    const { data: tokenRow } = await admin
      .from("integration_secrets")
      .select("encrypted_value")
      .eq("secret_key", "messaging_bridge_internal_token")
      .maybeSingle();
    if (!tokenRow || !internalToken || tokenRow.encrypted_value !== internalToken) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }

    const body = await req.json();
    const { channel, chat_id, text, display_name } = body as {
      channel: "telegram" | "whatsapp" | "sms";
      chat_id: string;
      text: string;
      display_name?: string;
    };

    if (!channel || !chat_id || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "channel, chat_id, text required" }), { status: 400 });
    }

    const trimmed = text.trim();

    // ─── /link 123456 — bind chat to user ──────────────────────────────────
    const linkMatch = trimmed.match(/^\/?link\s+(\d{6})\b/i);
    if (linkMatch) {
      const code = linkMatch[1];
      const { data: codeRow } = await admin
        .from("messaging_link_codes")
        .select("id, user_id, expires_at, used_at")
        .eq("code", code)
        .is("used_at", null)
        .maybeSingle();

      if (!codeRow || new Date(codeRow.expires_at) < new Date()) {
        await admin.from("messaging_inbound_log").insert({
          channel, chat_id, inbound_text: trimmed, outcome: "link_invalid",
        });
        return new Response(JSON.stringify({
          reply: "That code is invalid or expired. Generate a fresh one in the Lovable app under Settings → Integrations → Messaging Bridge.",
        }), { headers: { "Content-Type": "application/json" } });
      }

      await admin.from("messaging_chat_bindings").upsert({
        user_id: codeRow.user_id,
        channel, chat_id,
        display_name: display_name || null,
      }, { onConflict: "channel,chat_id" });

      await admin.from("messaging_link_codes").update({
        used_at: new Date().toISOString(),
        used_channel: channel,
        used_chat_id: chat_id,
      }).eq("id", codeRow.id);

      await admin.from("messaging_inbound_log").insert({
        channel, chat_id, user_id: codeRow.user_id,
        inbound_text: trimmed, outcome: "linked",
      });

      return new Response(JSON.stringify({
        reply: "You're linked. Send me anything — questions, intel requests, whatever you need. Type /unlink to disconnect.",
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ─── Find binding ──────────────────────────────────────────────────────
    const { data: binding } = await admin
      .from("messaging_chat_bindings")
      .select("user_id")
      .eq("channel", channel)
      .eq("chat_id", chat_id)
      .maybeSingle();

    if (!binding) {
      await admin.from("messaging_inbound_log").insert({
        channel, chat_id, inbound_text: trimmed, outcome: "unlinked",
      });
      return new Response(JSON.stringify({
        reply: "Hey — we're not connected yet. Open the Lovable app, go to Settings → Integrations → Messaging Bridge, generate a 6-digit code, then send it to me as: /link 123456",
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ─── /unlink ───────────────────────────────────────────────────────────
    if (/^\/?unlink\b/i.test(trimmed)) {
      await admin.from("messaging_chat_bindings")
        .delete()
        .eq("channel", channel)
        .eq("chat_id", chat_id);
      await admin.from("messaging_inbound_log").insert({
        channel, chat_id, user_id: binding.user_id,
        inbound_text: trimmed, outcome: "unlinked_by_user",
      });
      return new Response(JSON.stringify({
        reply: "Done — disconnected. You can re-link anytime from the app.",
      }), { headers: { "Content-Type": "application/json" } });
    }

    // Update last_seen
    admin.from("messaging_chat_bindings")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("channel", channel)
      .eq("chat_id", chat_id)
      .then(() => {});

    // Resolve role + language
    const [{ data: roles }, { data: profile }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", binding.user_id),
      admin.from("profiles").select("preferred_language, full_name").eq("user_id", binding.user_id).maybeSingle(),
    ]);
    const role = deriveRole(roles ?? []);
    const langCode = profile?.preferred_language || "en";
    const langName = LANG_NAMES[langCode] || "English";
    const friendlyName = display_name || profile?.full_name || "there";

    // ─── /note <text> — staff capture ──────────────────────────────────────
    const noteMatch = trimmed.match(/^\/?note\s+(.+)/is);
    if (noteMatch && isStaffRole(role)) {
      const noteText = noteMatch[1].trim().slice(0, 2000);
      const { data: lastBooking } = await admin
        .from("bookings")
        .select("id")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastBooking) {
        return new Response(JSON.stringify({
          reply: "No active booking found to attach the note to.",
        }), { headers: { "Content-Type": "application/json" } });
      }
      await admin.from("messages").insert({
        booking_id: lastBooking.id,
        sender_id: binding.user_id,
        content: `[via ${channel}] ${noteText}`,
        is_internal: true,
        draft: false,
      });
      await admin.from("messaging_inbound_log").insert({
        channel, chat_id, user_id: binding.user_id,
        inbound_text: trimmed, outcome: "note_captured",
      });
      return new Response(JSON.stringify({
        reply: `Captured. Internal note saved on your last booking.`,
      }), { headers: { "Content-Type": "application/json" } });
    }

    // ─── /help ─────────────────────────────────────────────────────────────
    if (/^\/?help\b/i.test(trimmed)) {
      const help = isStaffRole(role)
        ? "Commands: /note <text> to capture an internal note on your last booking. /unlink to disconnect. Otherwise just ask anything — I can pull intel, status, and quick answers."
        : "Just ask anything about your stay — I'll help where I can. /unlink to disconnect.";
      return new Response(JSON.stringify({ reply: help }), { headers: { "Content-Type": "application/json" } });
    }

    // ─── Normal Q&A path ───────────────────────────────────────────────────
    const context = await buildContext(admin, binding.user_id, role);
    const systemPrompt = buildSystemPrompt(role, langName, channel, friendlyName) + "\n\n" + context;
    const reply = await callAI(systemPrompt, trimmed, lovableApiKey);

    await admin.from("messaging_inbound_log").insert({
      channel, chat_id, user_id: binding.user_id,
      inbound_text: trimmed.slice(0, 1000),
      outbound_text: reply.slice(0, 2000),
      outcome: "answered",
    });

    // Log AI call for shared rate limiting
    admin.from("security_events").insert({
      event_type: "ai_assistant_call",
      severity: "info",
      actor_id: binding.user_id,
      details: { source: `messaging-bridge:${channel}` },
    }).then(() => {});

    return new Response(JSON.stringify({ reply }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("messaging-router error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
