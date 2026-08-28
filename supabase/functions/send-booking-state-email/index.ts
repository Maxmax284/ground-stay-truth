// send-booking-state-email
// -----------------------------------------------------------------------------
// Guest lifecycle email for one booking state change. Called by staff UI after
// a booking transition succeeds. The browser only names the booking and the new
// state — recipient, guest language and all template data are resolved here
// from the database, so no arbitrary recipient or template can be injected.
//
// POST { booking_id: string, state: "confirmed" | "checked_in" | "completed" }
// Auth: required, caller must hold an operational role.
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAppEmail } from "../_shared/appEmail.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
};

const OPERATIONAL_ROLES = [
  "admin",
  "manager",
  "front_desk_supervisor",
  "front_desk",
  "housekeeping_supervisor",
];

const STATE_TEMPLATE: Record<string, string> = {
  confirmed: "booking_confirmed",
  checked_in: "welcome_checkin",
  completed: "checkout_followup",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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
    const allowed = (callerRoles ?? []).some((r: any) => OPERATIONAL_ROLES.includes(r.role));
    if (!allowed) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.booking_id === "string" ? body.booking_id : "";
    const state = typeof body?.state === "string" ? body.state : "";
    const templateName = STATE_TEMPLATE[state];
    if (!bookingId || !templateName) {
      return json({ error: "booking_id and a supported state are required" }, 400);
    }

    const { data: booking, error: bookingErr } = await admin
      .from("bookings")
      .select("id, guest_id, check_in, check_out, num_guests, total_price, units(name)")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingErr || !booking) return json({ error: "booking_not_found" }, 404);
    if (!booking.guest_id) return json({ sent: false, reason: "no_guest_account" });

    const { data: guestProfile } = await admin
      .from("profiles")
      .select("email, full_name, preferred_language")
      .eq("user_id", booking.guest_id)
      .maybeSingle();
    if (!guestProfile?.email) return json({ sent: false, reason: "no_guest_email" });

    const { data: policies } = await admin
      .from("policy_settings")
      .select("key, value")
      .in("key", [
        "earliest_checkin_time", "checkout_time", "currency_symbol",
        "wifi_network_name", "wifi_password",
        "house_rules_summary", "emergency_contact_name", "emergency_contact_phone",
      ]);
    const pMap = new Map(
      (policies ?? []).map((p: any) => [p.key, String(p.value).replace(/^"|"$/g, "")]),
    );

    const unitName = (booking as any).units?.name || "Your Unit";
    const guestName = guestProfile.full_name || "Guest";
    const lang = guestProfile.preferred_language || "en";
    const currSym = pMap.get("currency_symbol") || "฿";

    const base = {
      guest_name: guestName,
      unit_name: unitName,
      check_in: booking.check_in,
      check_out: booking.check_out,
    };

    let templateData: Record<string, unknown> = base;
    if (state === "confirmed") {
      templateData = {
        ...base,
        checkin_time: pMap.get("earliest_checkin_time") || "16:00",
        checkout_time: pMap.get("checkout_time") || "11:00",
        num_guests: booking.num_guests,
        total_formatted: `${currSym}${(booking.total_price ?? 0).toLocaleString()}`,
      };
    } else if (state === "checked_in") {
      templateData = {
        ...base,
        checkin_time: pMap.get("earliest_checkin_time") || "16:00",
        checkout_time: pMap.get("checkout_time") || "11:00",
        wifi_network: pMap.get("wifi_network_name") || "",
        wifi_password: pMap.get("wifi_password") || "",
        house_rules: pMap.get("house_rules_summary") || "",
        emergency_name: pMap.get("emergency_contact_name") || "Front Desk",
        emergency_phone: pMap.get("emergency_contact_phone") || "",
      };
    }

    const result = await sendAppEmail({
      templateName,
      recipientEmail: guestProfile.email,
      bookingId,
      language: lang,
      source: `state_change:${state}`,
      triggeredBy: caller.id,
      templateData,
    });

    return json(result);
  } catch (e) {
    console.error("[send-booking-state-email] fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown_error" }, 500);
  }
});
