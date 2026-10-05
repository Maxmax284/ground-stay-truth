import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";

const STAFF_ROLES = ["front_desk", "front_desk_supervisor", "manager", "admin"];
const ADMIN_ROLES = ["admin"];
const BOOKING_STATES = new Set(["inquiry", "pending_deposit", "confirmed"]);
const PICKUP_AIRPORTS = new Set(["USM", "BKK", "DMK", "URT", "HKT", "CNX", "KBV", "SIN", "KUL"]);

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeEmail(value: unknown): string | null {
  const email = asString(value)?.toLowerCase() ?? null;
  if (!email || !email.includes("@") || email.length > 255) return null;
  return email;
}

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") + "Aa1!";
}

function normalizeAirport(value: unknown): string | null {
  const raw = asString(value)?.toUpperCase() ?? null;
  if (!raw) return null;
  if (raw === "SAMUI") return "USM";
  return PICKUP_AIRPORTS.has(raw) ? raw : raw.slice(0, 12);
}

async function getCaller(req: Request, supabaseUrl: string, anonKey: string, serviceKey: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: "Unauthorized", status: 401 } as const;

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { error: "Unauthorized", status: 401 } as const;

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: roles, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  if (roleError) return { error: "Role check failed", status: 500 } as const;
  const roleSet = new Set((roles ?? []).map((r: any) => r.role));
  return { user, admin, roleSet } as const;
}

async function ensureGuestAccount(admin: any, input: any) {
  const email = normalizeEmail(input?.email);
  const fullName = asString(input?.full_name);
  if (!email) throw new Error("Valid guest email is required");
  if (!fullName) throw new Error("Guest full name is required");

  const phone = asString(input?.phone);
  const preferredLanguage = asString(input?.preferred_language) ?? "en";
  const notes = asString(input?.notes);

  const { data: existingProfile, error: profileError } = await admin
    .from("profiles")
    .select("user_id, full_name, email, phone, preferred_language")
    .eq("email", email)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);

  let userId = existingProfile?.user_id ?? null;
  let createdAccount = false;

  if (!userId) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError) {
      if (!/already|registered|exists/i.test(createError.message)) {
        throw new Error(createError.message);
      }

      // Duplicate auth user but no profile row. Search the first few pages and repair profile/role.
      for (let page = 1; page <= 10 && !userId; page += 1) {
        const { data: pageData, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 100 });
        if (listError) throw new Error(listError.message);
        const found = pageData?.users?.find((u: any) => String(u.email ?? "").toLowerCase() === email);
        if (found) userId = found.id;
        if (!pageData?.users || pageData.users.length < 100) break;
      }
      if (!userId) throw new Error("Guest account already exists, but could not be linked safely");
    } else {
      userId = created.user.id;
      createdAccount = true;
    }
  }

  const { error: upsertProfileError } = await admin.from("profiles").upsert({
    user_id: userId,
    email,
    full_name: fullName,
    phone,
    preferred_language: preferredLanguage,
  }, { onConflict: "user_id" });
  if (upsertProfileError) throw new Error(upsertProfileError.message);

  const { error: roleError } = await admin.from("user_roles").upsert({ user_id: userId, role: "guest" }, { onConflict: "user_id,role" });
  if (roleError && !/duplicate/i.test(roleError.message)) throw new Error(roleError.message);

  return { userId, email, fullName, phone, preferredLanguage, notes, createdAccount };
}

async function notifyRoles(admin: any, roles: string[], callerId: string, payload: { type: string; reference_id: string; message: string }) {
  const { data } = await admin.from("user_roles").select("user_id, role").in("role", roles);
  const recipients = [...new Set((data ?? []).map((r: any) => r.user_id).filter((id: string) => id !== callerId))];
  if (!recipients.length) return;
  await admin.from("notifications").insert(recipients.map((user_id) => ({ user_id, ...payload })));
}

async function confirmLanding(admin: any, callerId: string, bookingId: string, airport?: string | null, staffNote?: string | null) {
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id, guest_id, unit_id, manual_guest_name, units(name), profiles!bookings_guest_id_profiles_fkey(full_name, email)")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) throw new Error(bookingError.message);
  if (!booking) throw new Error("Booking not found");

  const { data: pickup, error: pickupError } = await admin
    .from("airport_pickups")
    .select("id, status, guest_landed_at, confirmed_airport, driver_id, drivers(name, phone, whatsapp, vehicle_type, license_plate, photo_url)")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (pickupError) throw new Error(pickupError.message);
  if (!pickup) throw new Error("No pickup found for this booking");

  const now = new Date().toISOString();
  const confirmedAirport = normalizeAirport(airport) ?? pickup.confirmed_airport ?? null;
  const updatePayload: Record<string, unknown> = {
    guest_landed_at: pickup.guest_landed_at ?? now,
  };
  if (confirmedAirport) updatePayload.confirmed_airport = confirmedAirport;
  if (["requested", "assigned"].includes(pickup.status)) {
    updatePayload.status = "confirmed";
    updatePayload.confirmed_at = now;
  }

  const { error: updateError } = await admin.from("airport_pickups").update(updatePayload).eq("id", pickup.id);
  if (updateError) throw new Error(updateError.message);

  await admin.from("stay_support_log").insert({
    booking_id: bookingId,
    request_type: "airport_pickup",
    request_id: pickup.id,
    action: "staff_confirmed_landing",
    from_status: pickup.status,
    to_status: String(updatePayload.status ?? pickup.status),
    note: staffNote ?? `Landing confirmed by staff${confirmedAirport ? ` at ${confirmedAirport}` : ""}`,
    changed_by: callerId,
    change_type: "normal",
  });

  const guestName = (booking as any).profiles?.full_name ?? booking.manual_guest_name ?? "Guest";
  const unitName = (booking as any).units?.name ?? "unit";
  const driverName = pickup.drivers?.name ?? "driver pending";
  const plate = pickup.drivers?.license_plate ? ` · ${pickup.drivers.license_plate}` : "";

  if (booking.guest_id) {
    await admin.from("notifications").insert({
      user_id: booking.guest_id,
      type: "pickup_confirmed",
      reference_id: bookingId,
      message: `Front desk confirmed your landing. Driver: ${driverName}${plate}. Please wait at the posted meeting point.`,
    });
  }

  await notifyRoles(admin, STAFF_ROLES, callerId, {
    type: "guest_landed",
    reference_id: bookingId,
    message: `Staff confirmed ${guestName} landed${confirmedAirport ? ` at ${confirmedAirport}` : ""} for ${unitName}. Driver: ${driverName}${plate}.`,
  });

  return {
    pickup_id: pickup.id,
    landed_at: updatePayload.guest_landed_at,
    driver: pickup.drivers ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = await getCaller(req, supabaseUrl, anonKey, serviceKey);
    if ("error" in caller) return jsonResponse(req, { error: caller.error }, caller.status);

    const { user, admin, roleSet } = caller;
    if (!ADMIN_ROLES.some((r) => roleSet.has(r))) {
      return jsonResponse(req, { error: "Only admins can run the full booking flow" }, 403);
    }

    const body = await req.json();
    const action = asString(body?.action) ?? "create_booking_flow";

    if (action === "confirm_landing") {
      const bookingId = asString(body?.booking_id);
      if (!bookingId) return jsonResponse(req, { error: "booking_id required" }, 400);
      const result = await confirmLanding(admin, user.id, bookingId, body?.confirmed_airport, asString(body?.staff_note));
      return jsonResponse(req, { ok: true, ...result });
    }

    if (action !== "create_booking_flow") {
      return jsonResponse(req, { error: "Unsupported action" }, 400);
    }

    const guest = await ensureGuestAccount(admin, body?.guest ?? {});
    const stay = body?.stay ?? {};
    const pickupInput = body?.pickup ?? {};

    const unitId = asString(stay.unit_id);
    const checkIn = asString(stay.check_in);
    const checkOut = asString(stay.check_out);
    const state = asString(stay.state) ?? "confirmed";
    if (!unitId) return jsonResponse(req, { error: "unit_id required" }, 400);
    if (!checkIn || !checkOut) return jsonResponse(req, { error: "check-in and check-out are required" }, 400);
    if (!BOOKING_STATES.has(state)) return jsonResponse(req, { error: "Invalid booking state" }, 400);

    const { data: unit, error: unitError } = await admin
      .from("units")
      .select("id, name, property_id, capacity")
      .eq("id", unitId)
      .maybeSingle();
    if (unitError) throw new Error(unitError.message);
    if (!unit) return jsonResponse(req, { error: "Unit not found" }, 404);

    const totalPrice = Number(stay.total_price ?? 0);
    const numGuests = Math.max(1, Number.parseInt(String(stay.num_guests ?? 1), 10) || 1);
    const notes = [
      asString(stay.notes),
      guest.notes ? `Guest account note: ${guest.notes}` : null,
    ].filter(Boolean).join("\n") || null;

    const { data: booking, error: bookingError } = await admin.from("bookings").insert({
      unit_id: unitId,
      guest_id: guest.userId,
      state,
      check_in: checkIn,
      check_out: checkOut,
      num_guests: numGuests,
      total_price: totalPrice > 0 ? totalPrice : null,
      original_total: totalPrice > 0 ? totalPrice : null,
      notes,
      created_by: user.id,
      guest_type: asString(stay.guest_type) ?? "standard",
      flight_number: asString(pickupInput.flight_number),
      property_id: unit.property_id,
      manual_guest_name: guest.fullName,
      manual_guest_email: guest.email,
      manual_guest_phone: guest.phone,
      pay_on_arrival: Boolean(stay.pay_on_arrival),
      offline_acknowledgements: stay.pay_on_arrival
        ? { admin_booking_flow: true, acknowledged_at: new Date().toISOString(), actor_id: user.id }
        : {},
    }).select("id, state, check_in, check_out, guest_id").single();
    if (bookingError) throw new Error(bookingError.message);

    await admin.from("booking_state_log").insert({
      booking_id: booking.id,
      to_state: state,
      changed_by: user.id,
      reason: "Admin booking flow created booking",
    });

    let pickup = null;
    if (Boolean(pickupInput.enabled)) {
      const driverId = asString(pickupInput.driver_id);
      if (driverId) {
        const { data: driver, error: driverError } = await admin.from("drivers").select("id, name, is_active").eq("id", driverId).maybeSingle();
        if (driverError) throw new Error(driverError.message);
        if (!driver || driver.is_active === false) return jsonResponse(req, { error: "Active driver not found" }, 400);
      }

      const pickupStatus = driverId ? "assigned" : "requested";
      const confirmedAirport = normalizeAirport(pickupInput.confirmed_airport);
      const { data: pickupRow, error: pickupError } = await admin.from("airport_pickups").insert({
        booking_id: booking.id,
        property_id: unit.property_id,
        driver_id: driverId,
        status: pickupStatus,
        fee: Math.max(0, Number(pickupInput.fee ?? 0) || 0),
        flight_number: asString(pickupInput.flight_number)?.toUpperCase() ?? null,
        international_flight_number: asString(pickupInput.international_flight_number)?.toUpperCase() ?? null,
        final_flight_confirmed: Boolean(asString(pickupInput.flight_number)),
        arrival_datetime: asString(pickupInput.arrival_datetime),
        passenger_count: Math.max(1, Number.parseInt(String(pickupInput.passenger_count ?? numGuests), 10) || numGuests),
        luggage_notes: asString(pickupInput.luggage_notes),
        special_instructions: asString(pickupInput.special_instructions),
        assigned_by: driverId ? user.id : null,
        assigned_at: driverId ? new Date().toISOString() : null,
        confirmed_airport: confirmedAirport,
        arrival_type: "flight",
        arrival_location_type: "airport",
        arrival_location_name: confirmedAirport,
        transport_intent: "pickup",
        pickup_enabled: true,
      }).select("id, status").single();
      if (pickupError) throw new Error(pickupError.message);
      pickup = pickupRow;

      await admin.from("stay_support_log").insert({
        booking_id: booking.id,
        request_type: "airport_pickup",
        request_id: pickupRow.id,
        action: driverId ? "admin_flow_pickup_created_driver_assigned" : "admin_flow_pickup_created",
        to_status: pickupStatus,
        note: "Pickup created from admin booking flow",
        changed_by: user.id,
        change_type: "normal",
      });
    }

    let landing = null;
    if (pickup && Boolean(body?.confirm_landing_now)) {
      landing = await confirmLanding(admin, user.id, booking.id, pickupInput.confirmed_airport, "Landing confirmed during admin booking flow");
    }

    await notifyRoles(admin, ["admin", "manager"], user.id, {
      type: "booking",
      reference_id: booking.id,
      message: `Admin booking flow created ${guest.fullName} in ${unit.name} (${checkIn} → ${checkOut}).`,
    });

    try {
      await admin.rpc("log_staff_audit_event", {
        _event_type: "admin_booking_flow_created",
        _severity: "medium",
        _actor_id: user.id,
        _target_user_id: guest.userId,
        _reason: null,
        _metadata: {
          booking_id: booking.id,
          guest_email: guest.email,
          created_guest_account: guest.createdAccount,
          pickup_id: pickup?.id ?? null,
          landing_confirmed: Boolean(landing),
        },
      });
    } catch (auditError) {
      console.warn("admin booking flow audit failed", auditError);
    }

    return jsonResponse(req, {
      ok: true,
      booking_id: booking.id,
      guest_user_id: guest.userId,
      guest_account_created: guest.createdAccount,
      pickup_id: pickup?.id ?? null,
      landing,
      arrivals_board_url: "/front-desk?view=arrivals",
    });
  } catch (error) {
    console.error("admin-booking-flow error", error);
    return jsonResponse(req, { error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
