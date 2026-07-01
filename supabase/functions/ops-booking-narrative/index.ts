// Ops Control Tower — AI narrative summary for a single booking.
// Read-only: fetches operational timeline via SECURITY DEFINER RPC,
// asks Lovable AI for a plain-English summary, and logs the invocation
// to staff_audit_events. Never mutates booking state.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "missing authorization" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    // Caller-scoped client (enforces RLS + RPC admin/manager guard)
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const service = createClient(SUPABASE_URL, SERVICE);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const actorId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const bookingId = body?.booking_id as string | undefined;
    if (!bookingId) return json({ error: "booking_id required" }, 400);

    // Timeline (RPC enforces admin OR manager)
    const { data: timeline, error: tlErr } = await userClient.rpc(
      "get_booking_operational_timeline",
      { _booking_id: bookingId },
    );
    if (tlErr) return json({ error: tlErr.message }, 403);

    // Booking header for context
    const { data: booking } = await service
      .from("bookings")
      .select("id,state,check_in,check_out,num_guests,total_price,unit_id,guest_id")
      .eq("id", bookingId)
      .maybeSingle();

    const events = (timeline ?? []) as Array<Record<string, unknown>>;
    const fmt = (e: Record<string, unknown>) =>
      `- [${e.occurred_at}] (${e.category}) ${e.label}${e.detail ? " — " + e.detail : ""}`;
    const facts = events.slice(0, 60).map(fmt).join("\n");

    // Highlight top key events so the narrative stays grounded in what the user sees.
    // Priority categories match the visible timeline's most operationally meaningful signals.
    const PRIORITY: Record<string, number> = {
      state: 5, payment: 4, payment_link: 3, pickup: 3, arrival: 3, housekeeping: 2, audit: 1,
    };
    const keyEvents = [...events]
      .sort((a, b) => {
        const pa = PRIORITY[String(a.category)] ?? 0;
        const pb = PRIORITY[String(b.category)] ?? 0;
        if (pb !== pa) return pb - pa;
        return String(b.occurred_at).localeCompare(String(a.occurred_at));
      })
      .slice(0, 5);
    const keyFacts = keyEvents.map(fmt).join("\n") || "(none)";

    const prompt =
      `You are summarizing the operational history of one hospitality booking for an admin.\n` +
      `Write a plain-English East Coast toned briefing in 4–7 sentences. No fluff, no marketing.\n` +
      `Cover: current state, payment posture, arrival/pickup readiness, doc/turnover issues, and anything unusual.\n` +
      `Ground the summary in the KEY EVENTS below — reference them explicitly. Use the full EVENTS list only for supporting context.\n` +
      `Do NOT recommend state changes. Do NOT fabricate facts not in the events.\n\n` +
      `BOOKING: ${JSON.stringify(booking ?? {})}\n\n` +
      `KEY EVENTS (top ${keyEvents.length}, prioritized):\n${keyFacts}\n\n` +
      `EVENTS (newest first, full):\n${facts || "(none)"}\n`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You produce concise, factual operational briefings. Never invent details." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      if (aiResp.status === 429) return json({ error: "rate limited" }, 429);
      if (aiResp.status === 402) return json({ error: "AI credits exhausted" }, 402);
      return json({ error: "ai_failed", detail: errText.slice(0, 500) }, 500);
    }

    const aiJson = await aiResp.json();
    const narrative: string =
      aiJson?.choices?.[0]?.message?.content?.toString().trim() || "(no narrative generated)";

    // Log to staff_audit_events (no state change)
    await service.rpc("log_staff_audit_event", {
      _event_type: "security_setting_changed", // reuse allowed type; carries booking_id in metadata
      _severity: "info",
      _actor_id: actorId,
      _target_user_id: null,
      _reason: "ops_control_tower.ai_narrative_generated",
      _metadata: {
        booking_id: bookingId,
        surface: "ops_control_tower",
        event_count: events.length,
        model: "google/gemini-2.5-flash",
        narrative_preview: narrative.slice(0, 240),
      },
    });

    return json({ narrative, event_count: events.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
