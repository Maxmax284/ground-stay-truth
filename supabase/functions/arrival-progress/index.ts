// arrival-progress
// -----------------------------------------------------------------------------
// Stage 3 of Guest Arrival Intelligence: the guest-progress track.
//
// Doctrine enforced here:
//  * Aircraft landing never advances this ladder. Only a named human does.
//  * "I'm ready" is the guest (or staff on their behalf) saying they are out of
//    the terminal. "Collected" is staff/driver confirming physical handover.
//  * Nothing here touches price, room, booking state, payments or check-in.
//  * Every write is stamped with the actor and logged in guest_arrival_stage_log.
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  return false;
}

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

const STAFF_ROLES = ["admin", "manager", "front_desk_supervisor", "front_desk"];

const rateLimit = new Map<string, { count: number; resetAt: number }>();
function allowed(key: string, max = 20, windowMs = 60_000) {
  const now = Date.now();
  const entry = rateLimit.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimit.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

Deno.serve(async (req) => {
  const headers = { ...cors(req), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  const fail = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return fail(401, "Unauthorized");

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return fail(401, "Unauthorized");
    if (!allowed(user.id)) return fail(429, "Too many requests");

    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "";
    const bookingId: string = body.booking_id ?? "";
    if (!bookingId) return fail(400, "booking_id required");
    if (!["guest_ready", "collected"].includes(action)) return fail(400, "Unknown action");

    const db = createClient(url, service);

    const { data: booking } = await db
      .from("bookings")
      .select("id, guest_id, units(name)")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return fail(404, "Booking not found");

    const { data: roles } = await db.from("user_roles").select("role").eq("user_id", user.id);
    const isStaff = (roles ?? []).some((r: any) => STAFF_ROLES.includes(r.role));
    const isOwner = booking.guest_id === user.id;

    if (action === "guest_ready" && !isOwner && !isStaff) return fail(403, "Not allowed");
    if (action === "collected" && !isStaff) return fail(403, "Only staff can confirm collection");

    const { data: pickup } = await db
      .from("airport_pickups")
      .select("id, status, guest_landed_at, guest_ready_at, collected_at, driver_id, confirmed_airport")
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (!pickup) return fail(404, "No pickup on this booking");

    const now = new Date().toISOString();
    const actorLabel = isStaff && !isOwner ? "staff" : "guest";

    const { data: profile } = await db
      .from("profiles")
      .select("full_name")
      .eq("user_id", isOwner ? user.id : booking.guest_id ?? user.id)
      .maybeSingle();
    const guestName = profile?.full_name || "The guest";
    const unitName = (booking as any).units?.name ?? "unknown unit";

    let updated = false;
    let alreadyDone = false;

    if (action === "guest_ready") {
      if (pickup.guest_ready_at) {
        alreadyDone = true;
      } else {
        const { error } = await db
          .from("airport_pickups")
          .update({ guest_ready_at: now, guest_ready_by: user.id })
          .eq("id", pickup.id)
          .is("guest_ready_at", null);
        if (error) return fail(500, error.message);
        updated = true;
      }
    }

    if (action === "collected") {
      if (pickup.collected_at) {
        alreadyDone = true;
      } else {
        const { error } = await db
          .from("airport_pickups")
          .update({ collected_at: now, collected_by: user.id })
          .eq("id", pickup.id)
          .is("collected_at", null);
        if (error) return fail(500, error.message);
        updated = true;
      }
    }

    if (updated) {
      // Named-actor audit. One row per (booking, stage).
      await db.from("guest_arrival_stage_log").insert({
        booking_id: bookingId,
        stage: action === "guest_ready" ? "ready_for_pickup" : "collected",
        triggered_by: actorLabel,
        context: { actor_id: user.id, pickup_id: pickup.id, at: now },
      });

      const { data: staffRoles } = await db
        .from("user_roles")
        .select("user_id")
        .in("role", STAFF_ROLES);
      const staffIds = [...new Set((staffRoles ?? []).map((r: any) => r.user_id))];

      const message =
        action === "guest_ready"
          ? `🧍 ${guestName} is out and ready for pickup (${unitName}).`
          : `🚗 ${guestName} has been collected by the driver (${unitName}).`;

      if (staffIds.length) {
        await db.from("notifications").insert(
          staffIds.map((id) => ({
            user_id: id,
            type: action === "guest_ready" ? "guest_ready" : "guest_collected",
            reference_id: bookingId,
            message,
          })),
        );
      }

      if (booking.guest_id) {
        await db.from("notifications").insert({
          user_id: booking.guest_id,
          type: action === "guest_ready" ? "guest_ready" : "guest_collected",
          reference_id: bookingId,
          message:
            action === "guest_ready"
              ? "Got it — the front desk knows you're waiting. Stay at the meeting point."
              : "You're with your driver. Reception is expecting you at camp.",
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        already: alreadyDone,
        action,
        at: updated ? now : (action === "guest_ready" ? pickup.guest_ready_at : pickup.collected_at),
      }),
      { headers },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers });
  }
});
