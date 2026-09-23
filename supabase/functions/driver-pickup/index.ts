// driver-pickup
// -----------------------------------------------------------------------------
// The driver's whole world: one pickup, read-only, behind an expiring link.
//
// Drivers have no account. Staff mint a link for a single pickup; this function
// reads it with the service role and returns only what a driver needs to do the
// job: guest name, flight, airport, Thai arrival time, meeting point, passenger
// count, luggage note, and a status line. Never money, never a booking
// reference, never another guest, never provenance or diagnostics.
//
// One action is allowed: "collected" — the driver confirming physical handover.
// Nothing else moves. A landed aircraft still never advances anything by itself.
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const responseHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const STAFF_ROLES = ["admin", "manager", "front_desk_supervisor", "front_desk"];

/** Per-token throttle: a shared link must not become a scraping surface. */
const hits = new Map<string, { count: number; resetAt: number }>();
function allowed(key: string, max = 60, windowMs = 60_000) {
  const now = Date.now();
  const e = hits.get(key);
  if (!e || now > e.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (e.count >= max) return false;
  e.count++;
  return true;
}

function bangkok(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: responseHeaders });
  const fail = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: responseHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(url, service);

    const body = await req.json().catch(() => ({}));
    const action: string = typeof body.action === "string" ? body.action : "view";
    const token: string = typeof body.token === "string" ? body.token.trim() : "";

    // --- Staff action: mint a link for one pickup -----------------------------
    if (action === "create") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return fail(401, "Unauthorized");
      const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return fail(401, "Unauthorized");
      const { data: roles } = await db.from("user_roles").select("role").eq("user_id", user.id);
      if (!(roles ?? []).some((r: any) => STAFF_ROLES.includes(r.role))) return fail(403, "Staff only");

      const pickupId: string = body.pickup_id ?? "";
      if (!pickupId) return fail(400, "pickup_id required");
      const { data: pickup } = await db
        .from("airport_pickups")
        .select("id, booking_id")
        .eq("id", pickupId)
        .maybeSingle();
      if (!pickup) return fail(404, "Pickup not found");

      const hours = Math.min(Math.max(Number(body.hours ?? 48), 1), 168);
      const newToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().slice(0, 8);
      const expires = new Date(Date.now() + hours * 3600_000).toISOString();

      // One live link per pickup: minting a new one retires the old.
      await db
        .from("pickup_driver_links")
        .update({ revoked_at: new Date().toISOString() })
        .eq("pickup_id", pickupId)
        .is("revoked_at", null);

      const { data: link, error } = await db
        .from("pickup_driver_links")
        .insert({
          pickup_id: pickupId,
          booking_id: pickup.booking_id,
          token: newToken,
          created_by: user.id,
          expires_at: expires,
        })
        .select("token, expires_at")
        .single();
      if (error) return fail(500, error.message);
      return new Response(JSON.stringify({ ok: true, token: link.token, expires_at: link.expires_at }), {
        headers: responseHeaders,
      });
    }

    // --- Signed-in guest/staff pickup chat -----------------------------------
    if (action === "authenticated_send") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return fail(401, "Unauthorized");
      const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return fail(401, "Unauthorized");

      const pickupId = typeof body.pickup_id === "string" ? body.pickup_id : "";
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!pickupId) return fail(400, "pickup_id required");
      if (!content || content.length > 1000) return fail(400, "Message must be between 1 and 1,000 characters");
      if (!allowed(`send:${user.id}`, 12, 60_000)) return fail(429, "Too many messages — wait a minute");

      const { data: pickup } = await db.from("airport_pickups").select("id, booking_id, property_id").eq("id", pickupId).maybeSingle();
      if (!pickup) return fail(404, "Pickup not found");
      const { data: booking } = await db.from("bookings").select("guest_id, manual_guest_name, profiles(full_name)").eq("id", pickup.booking_id).maybeSingle();
      const { data: roles } = await db.from("user_roles").select("role").eq("user_id", user.id);
      const { data: propertyAccess } = await db.from("user_property_assignments").select("id").eq("user_id", user.id).eq("property_id", pickup.property_id).maybeSingle();
      const isStaff = !!propertyAccess && (roles ?? []).some((role: any) => STAFF_ROLES.includes(role.role));
      const isGuest = booking?.guest_id === user.id;
      if (!isStaff && !isGuest) return fail(403, "This pickup is not available to you");

      const senderType = isStaff ? "staff" : "guest";
      const { data: message, error } = await db.from("pickup_driver_messages").insert({
        pickup_id: pickup.id,
        booking_id: pickup.booking_id,
        sender_type: senderType,
        sender_user_id: user.id,
        content,
      }).select("id, pickup_id, booking_id, sender_type, sender_user_id, content, read_by_guest_at, read_by_staff_at, read_by_driver_at, created_at").single();
      if (error) return fail(500, "Could not send message");

      const guestName = (booking as any)?.profiles?.full_name || booking?.manual_guest_name || "the guest";
      if (senderType === "guest") {
        const { data: staffRoles } = await db.from("user_roles").select("user_id").in("role", STAFF_ROLES);
        const roleIds = [...new Set((staffRoles ?? []).map((role: any) => role.user_id))];
        const { data: assignedStaff } = roleIds.length
          ? await db.from("user_property_assignments").select("user_id").eq("property_id", pickup.property_id).in("user_id", roleIds)
          : { data: [] };
        const staffIds = [...new Set((assignedStaff ?? []).map((row: any) => row.user_id))];
        if (staffIds.length) await db.from("notifications").insert(staffIds.map((id) => ({
          user_id: id, type: "pickup_message", reference_id: pickup.booking_id,
          message: `Pickup chat: ${guestName} sent a message for the driver.`,
        })));
      }
      return new Response(JSON.stringify({ ok: true, message }), { headers: responseHeaders });
    }

    // --- Driver actions: view / collected / message ---------------------------
    if (!token || token.length < 20) return fail(400, "Link is not valid");
    if (!allowed(token)) return fail(429, "Too many requests — try again in a minute");
    if (!["view", "collected", "send_message"].includes(action)) return fail(400, "Unknown action");

    const { data: link } = await db
      .from("pickup_driver_links")
      .select("id, pickup_id, booking_id, expires_at, revoked_at, view_count")
      .eq("token", token)
      .maybeSingle();
    if (!link) return fail(404, "This link is not valid");
    if (link.revoked_at) return fail(410, "This link has been turned off. Ask the camp for a new one.");
    if (new Date(link.expires_at).getTime() < Date.now()) {
      return fail(410, "This link has expired. Ask the camp for a new one.");
    }

      const { data: pickup } = await db
      .from("airport_pickups")
      .select(
        "id, booking_id, property_id, confirmed_airport, arrival_location_name, arrival_datetime, flight_number, " +
          "passenger_count, luggage_notes, special_instructions, guest_landed_at, guest_ready_at, collected_at, " +
          "drivers(name, license_plate, vehicle_type)",
      )
      .eq("id", link.pickup_id)
      .maybeSingle();
    if (!pickup) return fail(404, "This pickup no longer exists");

    const { data: booking } = await db
      .from("bookings")
      .select("id, guest_id, manual_guest_name, manual_guest_phone, profiles(full_name, phone)")
      .eq("id", link.booking_id)
      .maybeSingle();

    const guestName =
      (booking as any)?.profiles?.full_name || booking?.manual_guest_name || "Guest";
    const guestPhone = (booking as any)?.profiles?.phone || booking?.manual_guest_phone || null;

    // Live flight reading, if we already have one cached. Never bought here.
    const { data: flight } = await db
      .from("flight_tracking")
      .select("flight_number, airline_name, flight_status, delay_minutes, estimated_arrival, actual_arrival, terminal, gate")
      .eq("pickup_id", pickup.id)
      .maybeSingle();

    if (action === "send_message") {
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content || content.length > 1000) return fail(400, "Message must be between 1 and 1,000 characters");
      if (!allowed(`message:${token}`, 10, 60_000)) return fail(429, "Too many messages — wait a minute");
      const { data: message, error } = await db.from("pickup_driver_messages").insert({
        pickup_id: pickup.id,
        booking_id: link.booking_id,
        driver_link_id: link.id,
        sender_type: "driver",
        content,
      }).select("id, pickup_id, booking_id, sender_type, content, created_at").single();
      if (error) return fail(500, "Could not send message");

      const { data: staffRoles } = await db.from("user_roles").select("user_id").in("role", STAFF_ROLES);
      const roleIds = [...new Set((staffRoles ?? []).map((role: any) => role.user_id))];
      const { data: assignedStaff } = roleIds.length
        ? await db.from("user_property_assignments").select("user_id").eq("property_id", pickup.property_id).in("user_id", roleIds)
        : { data: [] };
      const staffIds = [...new Set((assignedStaff ?? []).map((row: any) => row.user_id))];
      const notices = staffIds.map((id) => ({
        user_id: id, type: "pickup_message", reference_id: link.booking_id,
        message: `Driver message for ${guestName}: ${content.slice(0, 120)}`,
      }));
      if (booking?.guest_id) notices.push({
        user_id: booking.guest_id, type: "pickup_message", reference_id: link.booking_id,
        message: `Your driver sent a pickup message: ${content.slice(0, 120)}`,
      });
      if (notices.length) await db.from("notifications").insert(notices);
      return new Response(JSON.stringify({ ok: true, message }), { headers: responseHeaders });
    }

    if (action === "collected") {
      if (!pickup.collected_at) {
        const now = new Date().toISOString();
        const { error } = await db
          .from("airport_pickups")
          .update({ collected_at: now })
          .eq("id", pickup.id)
          .is("collected_at", null);
        if (error) return fail(500, error.message);

        // The handover ends this driver's access. This response still confirms
        // collection, but every later request fails closed as revoked.
        await db.from("pickup_driver_links").update({ collected_at: now, revoked_at: now }).eq("id", link.id);
        await db.from("guest_arrival_stage_log").insert({
          booking_id: link.booking_id,
          stage: "collected",
          triggered_by: "driver",
          context: { pickup_id: pickup.id, at: now, via: "driver_link", link_id: link.id },
        });

        const { data: staffRoles } = await db.from("user_roles").select("user_id").in("role", STAFF_ROLES);
        const roleIds = [...new Set((staffRoles ?? []).map((role: any) => role.user_id))];
        const { data: assignedStaff } = roleIds.length
          ? await db.from("user_property_assignments").select("user_id").eq("property_id", pickup.property_id).in("user_id", roleIds)
          : { data: [] };
        const staffIds = [...new Set((assignedStaff ?? []).map((row: any) => row.user_id))];
        if (staffIds.length) {
          await db.from("notifications").insert(
            staffIds.map((id) => ({
              user_id: id,
              type: "guest_collected",
              reference_id: link.booking_id,
              message: `🚗 The driver confirmed ${guestName} is collected and on the way to camp.`,
            })),
          );
        }
        if (booking?.guest_id) {
          await db.from("notifications").insert({
            user_id: booking.guest_id,
            type: "guest_collected",
            reference_id: link.booking_id,
            message: "You're with your driver. Reception is expecting you at camp.",
          });
        }
        (pickup as any).collected_at = now;
      }
    } else {
      await db
        .from("pickup_driver_links")
        .update({ last_viewed_at: new Date().toISOString(), view_count: (link.view_count ?? 0) + 1 })
        .eq("id", link.id);
    }

    const { data: pickupMessages } = await db
      .from("pickup_driver_messages")
      .select("id, sender_type, content, created_at")
      .eq("pickup_id", pickup.id)
      .order("created_at", { ascending: true })
      .limit(100);

    await db.from("pickup_driver_messages")
      .update({ read_by_driver_at: new Date().toISOString() })
      .eq("pickup_id", pickup.id)
      .neq("sender_type", "driver")
      .is("read_by_driver_at", null);

    const status = pickup.collected_at
      ? "collected"
      : pickup.guest_ready_at
        ? "waiting"
        : pickup.guest_landed_at
          ? "clearing"
          : "not_landed";

    return new Response(
      JSON.stringify({
        ok: true,
        brief: {
          guest_name: guestName,
          guest_phone: guestPhone,
          passenger_count: pickup.passenger_count ?? null,
          flight_number: pickup.flight_number ?? flight?.flight_number ?? null,
          airline_name: flight?.airline_name ?? null,
          airport: pickup.confirmed_airport ?? null,
          location_name: pickup.arrival_location_name ?? null,
          arrival_datetime: pickup.arrival_datetime ?? null,
          arrival_local: bangkok(pickup.arrival_datetime ?? null),
          estimated_arrival_local: bangkok(flight?.estimated_arrival ?? null),
          flight_status: flight?.flight_status ?? null,
          delay_minutes: flight?.delay_minutes ?? 0,
          terminal: flight?.terminal ?? null,
          gate: flight?.gate ?? null,
          luggage_notes: pickup.luggage_notes ?? null,
          special_instructions: pickup.special_instructions ?? null,
          driver_name: (pickup as any).drivers?.name ?? null,
          license_plate: (pickup as any).drivers?.license_plate ?? null,
          vehicle: (pickup as any).drivers?.vehicle_type ?? null,
          status,
          collected_at: pickup.collected_at ?? null,
          expires_at: link.expires_at,
        },
        messages: pickupMessages ?? [],
      }),
      { headers: responseHeaders },
    );
  } catch (err) {
    console.error("driver-pickup error", err);
    return new Response(JSON.stringify({ error: "Something went wrong" }), { status: 500, headers: responseHeaders });
  }
});
