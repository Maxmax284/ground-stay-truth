// Admin-only "Test as Guest" simulator. Verifies caller is admin/manager,
// looks up the booking + guest, and proxies a simulated message through
// messaging-router using simulate_user_id (no real Telegram/WhatsApp send,
// no thread memory persistence).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    if (!roleSet.has("admin") && !roleSet.has("manager")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { booking_id, message, channel } = await req.json();
    if (!booking_id || typeof message !== "string" || !message.trim()) {
      return new Response(JSON.stringify({ error: "booking_id and message required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: booking } = await admin
      .from("bookings")
      .select("id, guest_id, profiles!bookings_guest_id_profiles_fkey(full_name)")
      .eq("id", booking_id).maybeSingle();
    if (!booking?.guest_id) {
      return new Response(JSON.stringify({ error: "Booking has no guest" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tokenRow } = await admin
      .from("integration_secrets").select("encrypted_value")
      .eq("secret_key", "messaging_bridge_internal_token").maybeSingle();
    if (!tokenRow?.encrypted_value) {
      return new Response(JSON.stringify({ error: "Internal bridge token not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch(`${supabaseUrl}/functions/v1/messaging-router`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-bridge": tokenRow.encrypted_value,
      },
      body: JSON.stringify({
        channel: channel || "telegram",
        chat_id: `simulator:${user.id}`,
        text: message,
        display_name: (booking as any).profiles?.full_name ?? "Guest",
        simulate_user_id: booking.guest_id,
      }),
    });
    const body = await resp.json();

    return new Response(JSON.stringify({
      ok: resp.ok,
      reply: body.reply ?? null,
      urgency: body.urgency ?? null,
      error: body.error ?? null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("admin-messaging-test error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
