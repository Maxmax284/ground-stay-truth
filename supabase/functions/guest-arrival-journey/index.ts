// guest-arrival-journey — orchestrates the 4-stage guest arrival notification flow.
//
// Modes (via ?mode= or body.mode):
//   - "stage1_guest"   → 18:00 Bangkok cron: tomorrow's arrivals get prep DM
//   - "stage1_staff"   → 08:00 Bangkok cron (folded into daily-briefing)
//   - "stage2_poll"    → AviationStack BKK landing detection
//   - "stage3_transfer"→ 30-min-out heads-up for platform-booked transfers
//   - "stage4_consume" → consume pending stage_4_checkin_pending markers
//   - "self_report"    → fired by messaging-router on detected guest intent
//                         body: { booking_id, stage: "stage_2_landed"|"stage_3_island", channel }
//
// Idempotency: every dispatched stage writes guest_arrival_stage_log
// (UNIQUE booking_id+stage). Duplicate calls no-op.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STAGE = {
  S1_GUEST: "stage_1_day_before_guest",
  S1_STAFF: "stage_1_day_before_staff",
  S2: "stage_2_bkk_landed",
  S3: "stage_3_island_arrival",
  S3_TRANSFER: "stage_3_transfer_eta",
  S4: "stage_4_checkin",
  S4_PENDING: "stage_4_checkin_pending",
} as const;

const BKK_AIRPORTS = ["VTBS", "VTBD", "BKK", "DMK"]; // ICAO + IATA

// ── helpers ─────────────────────────────────────────────────────────────

async function alreadyFired(admin: any, bookingId: string, stage: string): Promise<boolean> {
  const { data } = await admin
    .from("guest_arrival_stage_log")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("stage", stage)
    .maybeSingle();
  return !!data;
}

async function logStage(admin: any, bookingId: string, stage: string, triggeredBy: string, context: Record<string, unknown> = {}) {
  await admin.from("guest_arrival_stage_log").insert({
    booking_id: bookingId, stage, triggered_by: triggeredBy, context,
  }).select().maybeSingle();
}

async function dispatchNotify(admin: any, payload: {
  event_type: string;
  subject_id?: string;
  metadata?: Record<string, unknown>;
  target_user_ids?: string[];
  target_roles?: string[];
  guest_user_id?: string;
}) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-via-messaging`;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("dispatchNotify failed (non-fatal):", e);
  }
}

// ── Stage 1: day before ─────────────────────────────────────────────────

async function runStage1Guest(admin: any) {
  // tomorrow's date in Bangkok
  const now = new Date();
  const bkkOffsetMs = 7 * 60 * 60 * 1000;
  const bkkNow = new Date(now.getTime() + bkkOffsetMs);
  const tomorrow = new Date(bkkNow.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10);

  const { data: bookings } = await admin
    .from("bookings")
    .select("id, guest_id, check_in, units(name), properties(name, settings)")
    .eq("check_in", tomorrowDate)
    .in("state", ["confirmed", "pending_deposit"]);

  let dispatched = 0;
  for (const b of bookings ?? []) {
    if (!b.guest_id) continue;
    if (await alreadyFired(admin, b.id, STAGE.S1_GUEST)) continue;

    const propName = (b.properties as any)?.name ?? "the property";
    const settings = (b.properties as any)?.settings ?? {};
    const address = settings.address ?? settings.location ?? "";
    const checkinTime = settings.check_in_time ?? "16:00";

    await dispatchNotify(admin, {
      event_type: "arrival_stage_1_guest",
      subject_id: b.id,
      guest_user_id: b.guest_id,
      metadata: {
        unit_name: (b.units as any)?.name ?? "your unit",
        property_name: propName,
        check_in_time: checkinTime,
        address,
      },
    });
    await logStage(admin, b.id, STAGE.S1_GUEST, "auto", { date: tomorrowDate });
    dispatched++;
  }
  return { stage: "stage1_guest", dispatched, candidates: bookings?.length ?? 0 };
}

async function runStage1Staff(admin: any) {
  // today in Bangkok
  const now = new Date();
  const bkkNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const today = bkkNow.toISOString().slice(0, 10);

  const { data: arrivals } = await admin
    .from("bookings")
    .select("id, guest_id, flight_number, profiles:profiles!bookings_guest_id_profiles_fkey(full_name), units(name)")
    .eq("check_in", today)
    .in("state", ["confirmed", "pending_deposit", "checked_in"]);

  if (!arrivals?.length) return { stage: "stage1_staff", dispatched: 0 };

  const lines = arrivals.map((a: any) => {
    const name = a.profiles?.full_name ?? "Guest";
    const unit = a.units?.name ?? "unit TBD";
    const flight = a.flight_number ? ` ✈️${a.flight_number}` : "";
    return `• ${name} → ${unit}${flight}`;
  });
  const summary = lines.join("\n");

  await dispatchNotify(admin, {
    event_type: "arrival_stage_1_staff",
    metadata: { count: arrivals.length, summary, date: today },
    target_roles: ["admin", "manager", "front_desk_supervisor", "front_desk"],
  });

  // No per-booking log — this is a daily roll-up, not a per-guest stage.
  return { stage: "stage1_staff", dispatched: 1, count: arrivals.length };
}

// ── Stage 2: BKK landing (auto) ─────────────────────────────────────────

async function runStage2Poll(admin: any) {
  const apiKey = Deno.env.get("AVIATIONSTACK_API_KEY");
  if (!apiKey) return { stage: "stage2_poll", skipped: "no_aviationstack_key" };

  const now = new Date();
  const bkkNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const today = bkkNow.toISOString().slice(0, 10);
  const tomorrow = new Date(bkkNow.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: bookings } = await admin
    .from("bookings")
    .select("id, guest_id, flight_number, profiles:profiles!bookings_guest_id_profiles_fkey(full_name)")
    .not("flight_number", "is", null)
    .in("check_in", [today, tomorrow])
    .in("state", ["confirmed", "pending_deposit"]);

  let dispatched = 0;
  let polled = 0;
  for (const b of bookings ?? []) {
    if (!b.flight_number) continue;
    if (await alreadyFired(admin, b.id, STAGE.S2)) continue;

    polled++;
    try {
      const url = `https://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${encodeURIComponent(b.flight_number)}`;
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const json = await resp.json();
      const flight = json?.data?.[0];
      if (!flight) continue;

      const status = (flight.flight_status ?? "").toLowerCase();
      const arrIata = flight.arrival?.iata ?? flight.arrival?.icao ?? "";
      const landedHere = (status === "landed" || status === "active" && flight.arrival?.actual)
        && BKK_AIRPORTS.includes(arrIata.toUpperCase());

      if (!landedHere) continue;

      await dispatchNotify(admin, {
        event_type: "arrival_stage_2_guest",
        subject_id: b.id,
        guest_user_id: b.guest_id,
        metadata: { flight: b.flight_number },
      });
      await dispatchNotify(admin, {
        event_type: "arrival_stage_2_staff",
        subject_id: b.id,
        metadata: {
          guest_name: (b.profiles as any)?.full_name ?? "Guest",
          flight: b.flight_number,
        },
        target_roles: ["admin", "front_desk_supervisor", "front_desk"],
      });
      await logStage(admin, b.id, STAGE.S2, "auto", { flight: b.flight_number, airport: arrIata });
      dispatched++;
    } catch (e) {
      console.warn(`stage2 poll failed for booking ${b.id}:`, e);
      // graceful degradation — fall through to self-report
    }
  }
  return { stage: "stage2_poll", polled, dispatched };
}

// ── Stage 3: transfer ETA (auto) ────────────────────────────────────────

async function runStage3Transfer(admin: any) {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 60 * 1000);
  const in35 = new Date(now.getTime() + 35 * 60 * 1000);

  const { data: pickups } = await admin
    .from("airport_pickups")
    .select("id, booking_id, driver_id, arrival_datetime, status, drivers(name, phone), bookings(guest_id, profiles:profiles!bookings_guest_id_profiles_fkey(full_name), units(name))")
    .gte("arrival_datetime", in30.toISOString())
    .lte("arrival_datetime", in35.toISOString())
    .in("status", ["assigned", "confirmed", "en_route"]);

  let dispatched = 0;
  for (const p of pickups ?? []) {
    if (await alreadyFired(admin, p.booking_id, STAGE.S3_TRANSFER)) continue;

    const guestName = ((p.bookings as any)?.profiles?.full_name) ?? "Guest";
    const unitName = ((p.bookings as any)?.units?.name) ?? "unit";

    await dispatchNotify(admin, {
      event_type: "arrival_stage_3_staff",
      subject_id: p.booking_id,
      metadata: { guest_name: guestName, unit_name: unitName, eta_minutes: 30 },
      target_roles: ["front_desk_supervisor", "front_desk"],
    });

    if (p.driver_id) {
      // Driver may be linked as a user — try to notify; skip silently if not.
      await dispatchNotify(admin, {
        event_type: "arrival_stage_3_driver",
        subject_id: p.booking_id,
        metadata: { guest_name: guestName, unit_name: unitName },
        target_user_ids: [p.driver_id],
      });
    }

    await logStage(admin, p.booking_id, STAGE.S3_TRANSFER, "transfer", {
      pickup_id: p.id, eta: p.arrival_datetime,
    });
    dispatched++;
  }
  return { stage: "stage3_transfer", dispatched };
}

// ── Stage 4: check-in (consumes DB-trigger markers) ─────────────────────

async function runStage4Consume(admin: any) {
  const { data: pending } = await admin
    .from("guest_arrival_stage_log")
    .select("id, booking_id, context")
    .eq("stage", STAGE.S4_PENDING)
    .order("fired_at", { ascending: true })
    .limit(50);

  let dispatched = 0;
  for (const row of pending ?? []) {
    if (await alreadyFired(admin, row.booking_id, STAGE.S4)) {
      // already fully fired — clear the marker
      await admin.from("guest_arrival_stage_log").delete().eq("id", row.id);
      continue;
    }

    const { data: booking } = await admin
      .from("bookings")
      .select("id, guest_id, notes, units(name), properties(settings)")
      .eq("id", row.booking_id)
      .maybeSingle();
    if (!booking) {
      await admin.from("guest_arrival_stage_log").delete().eq("id", row.id);
      continue;
    }

    const settings = (booking.properties as any)?.settings ?? {};
    const wifi = settings.wifi_password ?? "";
    const unitName = (booking.units as any)?.name ?? "your unit";

    if (booking.guest_id) {
      await dispatchNotify(admin, {
        event_type: "arrival_stage_4_guest",
        subject_id: booking.id,
        guest_user_id: booking.guest_id,
        metadata: { unit_name: unitName, wifi },
      });
    }

    await dispatchNotify(admin, {
      event_type: "arrival_stage_4_staff",
      subject_id: booking.id,
      metadata: { unit_name: unitName },
      target_roles: ["front_desk_supervisor", "front_desk"],
    });

    // VIP check: notes contains "VIP" (case-insensitive) OR guest_type === 'vip'
    const notes = (booking.notes ?? "").toLowerCase();
    const isVip = notes.includes("vip");
    if (isVip) {
      await dispatchNotify(admin, {
        event_type: "arrival_stage_4_vip",
        subject_id: booking.id,
        metadata: { unit_name: unitName },
        target_roles: ["admin"],
      });
    }

    await logStage(admin, booking.id, STAGE.S4, "auto", { vip: isVip });
    await admin.from("guest_arrival_stage_log").delete().eq("id", row.id);
    dispatched++;
  }
  return { stage: "stage4_consume", dispatched };
}

// ── Self-report path (called by messaging-router) ───────────────────────

async function runSelfReport(admin: any, body: { booking_id: string; stage: "stage_2_landed" | "stage_3_island"; user_id?: string }) {
  const stageKey = body.stage === "stage_2_landed" ? STAGE.S2 : STAGE.S3;
  if (await alreadyFired(admin, body.booking_id, stageKey)) {
    return { skipped: "already_fired", stage: stageKey };
  }

  const { data: booking } = await admin
    .from("bookings")
    .select("id, guest_id, profiles:profiles!bookings_guest_id_profiles_fkey(full_name), units(name), properties(settings)")
    .eq("id", body.booking_id)
    .maybeSingle();
  if (!booking) return { error: "booking_not_found" };

  const guestName = (booking.profiles as any)?.full_name ?? "Guest";
  const unitName = (booking.units as any)?.name ?? "your unit";
  const settings = (booking.properties as any)?.settings ?? {};

  if (stageKey === STAGE.S2) {
    if (booking.guest_id) {
      await dispatchNotify(admin, {
        event_type: "arrival_stage_2_guest",
        subject_id: booking.id,
        guest_user_id: booking.guest_id,
        metadata: {},
      });
    }
    await dispatchNotify(admin, {
      event_type: "arrival_stage_2_staff",
      subject_id: booking.id,
      metadata: { guest_name: guestName, flight: "self-reported" },
      target_roles: ["admin", "front_desk_supervisor", "front_desk"],
    });
  } else {
    if (booking.guest_id) {
      await dispatchNotify(admin, {
        event_type: "arrival_stage_3_guest",
        subject_id: booking.id,
        guest_user_id: booking.guest_id,
        metadata: { unit_name: unitName, address: settings.address ?? "" },
      });
    }
    await dispatchNotify(admin, {
      event_type: "arrival_stage_3_staff",
      subject_id: booking.id,
      metadata: { guest_name: guestName, unit_name: unitName, eta_minutes: 0 },
      target_roles: ["front_desk_supervisor", "front_desk"],
    });
  }

  await logStage(admin, booking.id, stageKey, "self_report");
  return { stage: stageKey, fired: true };
}

// ── HTTP entry ──────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    let mode = url.searchParams.get("mode") ?? "";
    let body: any = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { /* ignore */ }
      if (!mode) mode = body.mode ?? "";
    }

    let result: unknown;
    switch (mode) {
      case "stage1_guest":    result = await runStage1Guest(admin); break;
      case "stage1_staff":    result = await runStage1Staff(admin); break;
      case "stage2_poll":     result = await runStage2Poll(admin); break;
      case "stage3_transfer": result = await runStage3Transfer(admin); break;
      case "stage4_consume":  result = await runStage4Consume(admin); break;
      case "self_report":     result = await runSelfReport(admin, body); break;
      case "all_crons":
        result = {
          s1g: await runStage1Guest(admin),
          s2:  await runStage2Poll(admin),
          s3:  await runStage3Transfer(admin),
          s4:  await runStage4Consume(admin),
        };
        break;
      default:
        return new Response(JSON.stringify({ error: "unknown mode", got: mode }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("guest-arrival-journey error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
