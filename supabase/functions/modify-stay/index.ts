// modify-stay  [BUSINESS-CRITICAL] [PAYMENT-CRITICAL]
//
// Single entry point for changing an existing stay: extending, shortening,
// moving rooms, or splitting a stay across rooms. Staff-only.
//
// POST { action: "preview" | "commit", booking_id, segments: [...], ... }
//
//  preview → validates the requested segments against real inventory
//            (other bookings' segments + maintenance blocks) and returns
//            conflicts. No writes.
//  commit  → re-validates, then atomically-ish:
//              1. writes a `stay_modifications` audit row (before/after)
//              2. replaces the booking's active `booking_segments`
//              3. syncs bookings.check_in / check_out / unit_id from segments
//              4. sets bookings.total_price to the new stay price
//              5. records a `booking_adjustments` discount row for any waiver
//              6. optionally mints a payment request for the difference
//              7. logs an override event so attribution is never missing
//
// Money authority: the room quote is calculated client-side with the shared
// pricing cascade and passed in. That mirrors how staff can already set a
// manual price override, so every figure is captured in the audit row
// (pricing_before / pricing_after / waived_amount / final_amount) along with
// the acting staff member's identity.
//
// Availability authority: server-only. The client never decides this.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";

const OPS_WRITE_ROLES = ["admin", "manager", "front_desk_supervisor", "front_desk"];
const WAIVER_ROLES = ["admin", "manager"];
const MODIFIABLE_STATES = ["pending_deposit", "confirmed", "checked_in"];

const KINDS = ["extend", "shorten", "room_change", "upgrade", "downgrade", "relocation", "combined", "other"];

interface SegmentInput {
  unit_id: string;
  starts_on: string;
  ends_on: string;
}

function isDate(v: unknown): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function normalizeSegments(raw: unknown): { segments: SegmentInput[]; error?: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { segments: [], error: "segments required" };
  if (raw.length > 12) return { segments: [], error: "Too many legs in one stay (max 12)" };
  const segments: SegmentInput[] = [];
  for (const r of raw) {
    const unit_id = String((r as any)?.unit_id ?? "").trim();
    const starts_on = String((r as any)?.starts_on ?? "");
    const ends_on = String((r as any)?.ends_on ?? "");
    if (!unit_id) return { segments: [], error: "Every leg needs a room" };
    if (!isDate(starts_on) || !isDate(ends_on)) return { segments: [], error: "Invalid segment dates" };
    if (ends_on <= starts_on) return { segments: [], error: "Check-out must be after check-in" };
    segments.push({ unit_id, starts_on, ends_on });
  }
  // Self-overlap on the same room inside one stay is a data error.
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (
        segments[i].unit_id === segments[j].unit_id &&
        overlaps(segments[i].starts_on, segments[i].ends_on, segments[j].starts_on, segments[j].ends_on)
      ) {
        return { segments: [], error: "Two legs book the same room on overlapping nights" };
      }
    }
  }
  return { segments };
}

/**
 * Inventory truth check. A requested leg conflicts when another booking's
 * ACTIVE segment (or a legacy booking with no segments) holds the same room on
 * overlapping nights, or when the room is under a maintenance block.
 */
async function findConflicts(
  admin: any,
  bookingId: string,
  segments: SegmentInput[],
): Promise<Array<{ unit_id: string; unit_name: string; starts_on: string; ends_on: string; reason: string; detail: string }>> {
  const unitIds = [...new Set(segments.map((s) => s.unit_id))];
  const windowStart = segments.map((s) => s.starts_on).sort()[0];
  const windowEnd = segments.map((s) => s.ends_on).sort().reverse()[0];

  const [{ data: units }, { data: otherSegments }, { data: blocks }] = await Promise.all([
    admin.from("units").select("id, name, is_active").in("id", unitIds),
    admin
      .from("booking_segments")
      .select("id, booking_id, unit_id, starts_on, ends_on, status, bookings(state)")
      .in("unit_id", unitIds)
      .neq("booking_id", bookingId)
      .in("status", ["active", "pending"])
      .lt("starts_on", windowEnd)
      .gt("ends_on", windowStart),
    admin
      .from("maintenance_blocks")
      .select("unit_id, start_date, end_date, reason")
      .in("unit_id", unitIds)
      .lt("start_date", windowEnd)
      .gt("end_date", windowStart),
  ]);

  const unitName = (id: string) => (units ?? []).find((u: any) => u.id === id)?.name ?? "room";
  const conflicts: Array<any> = [];

  for (const seg of segments) {
    const unit = (units ?? []).find((u: any) => u.id === seg.unit_id);
    if (!unit) {
      conflicts.push({ ...seg, unit_name: "Unknown", reason: "unknown_room", detail: "That room no longer exists." });
      continue;
    }
    if (unit.is_active === false) {
      conflicts.push({ ...seg, unit_name: unit.name, reason: "inactive_room", detail: `${unit.name} is not active.` });
    }

    for (const other of otherSegments ?? []) {
      const st = (other as any).bookings?.state;
      // Cancelled / no-show stays never hold inventory.
      if (st === "cancelled" || st === "no_show") continue;
      if (other.unit_id !== seg.unit_id) continue;
      if (!overlaps(seg.starts_on, seg.ends_on, other.starts_on, other.ends_on)) continue;
      conflicts.push({
        ...seg,
        unit_name: unit.name,
        reason: "booked",
        detail: `${unit.name} is already held ${other.starts_on} → ${other.ends_on} by another stay.`,
      });
    }

    for (const b of blocks ?? []) {
      if (b.unit_id !== seg.unit_id) continue;
      if (!overlaps(seg.starts_on, seg.ends_on, b.start_date, b.end_date)) continue;
      conflicts.push({
        ...seg,
        unit_name: unit.name,
        reason: "maintenance",
        detail: `${unitName(seg.unit_id)} is blocked ${b.start_date} → ${b.end_date}${b.reason ? ` (${b.reason})` : ""}.`,
      });
    }
  }

  return conflicts;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse(req, { error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return jsonResponse(req, { error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const roles = new Set((roleRows ?? []).map((r: any) => r.role));
    const actorRole = OPS_WRITE_ROLES.find((r) => roles.has(r));
    if (!actorRole) return jsonResponse(req, { error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "preview");
    const bookingId = String(body.booking_id ?? "").trim();
    if (!bookingId) return jsonResponse(req, { error: "booking_id required" }, 400);

    const { segments, error: segErr } = normalizeSegments(body.segments);
    if (segErr) return jsonResponse(req, { error: segErr }, 400);

    const { data: booking } = await admin
      .from("bookings")
      .select("id, state, unit_id, property_id, check_in, check_out, num_guests, total_price, guest_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return jsonResponse(req, { error: "Booking not found" }, 404);

    if (!MODIFIABLE_STATES.includes(booking.state)) {
      return jsonResponse(req, {
        error: "not_modifiable",
        message: `A ${String(booking.state).replace(/_/g, " ")} booking can't be modified. Confirm or check the guest in first.`,
        booking_state: booking.state,
      }, 400);
    }

    const conflicts = await findConflicts(admin, bookingId, segments);

    if (action === "preview") {
      return jsonResponse(req, { ok: conflicts.length === 0, conflicts });
    }

    if (action !== "commit") return jsonResponse(req, { error: "Unknown action" }, 400);

    const force = Boolean(body.force);
    if (conflicts.length > 0 && !force) {
      return jsonResponse(req, { error: "conflict", conflicts }, 409);
    }
    // Only admins may push a change through a real inventory conflict.
    if (conflicts.length > 0 && force && !roles.has("admin")) {
      return jsonResponse(req, { error: "Only an admin can override an inventory conflict", conflicts }, 403);
    }

    const kind = KINDS.includes(String(body.kind)) ? String(body.kind) : "other";
    const reasonCode = String(body.reason_code ?? "").trim();
    if (!reasonCode) return jsonResponse(req, { error: "reason_code required" }, 400);
    const notes = String(body.notes ?? "").trim().slice(0, 2000) || null;

    const pricingBefore = Math.max(0, Number(body.pricing_before ?? booking.total_price ?? 0));
    const pricingAfter = Math.max(0, Number(body.pricing_after ?? 0));
    if (!Number.isFinite(pricingAfter) || pricingAfter <= 0) {
      return jsonResponse(req, { error: "pricing_after must be a positive amount" }, 400);
    }

    const calculated = Math.round((pricingAfter - pricingBefore) * 100) / 100;
    let waived = Math.max(0, Number(body.waived_amount ?? 0));
    if (waived > 0 && !WAIVER_ROLES.some((r) => roles.has(r))) {
      return jsonResponse(req, { error: "Only an admin or manager can waive a modification charge" }, 403);
    }
    // A waiver can never exceed the extra amount actually being charged.
    waived = Math.min(waived, Math.max(0, calculated));
    const finalAmount = Math.round((calculated - waived) * 100) / 100;

    // Snapshot the current segments (or the legacy single-room shape) for audit.
    const { data: existingSegments } = await admin
      .from("booking_segments")
      .select("id, unit_id, starts_on, ends_on, status")
      .eq("booking_id", bookingId)
      .in("status", ["active", "pending"]);

    const beforeSnapshot = {
      state: booking.state,
      check_in: booking.check_in,
      check_out: booking.check_out,
      unit_id: booking.unit_id,
      total_price: Number(booking.total_price ?? 0),
      segments: (existingSegments ?? []).map((s: any) => ({
        unit_id: s.unit_id, starts_on: s.starts_on, ends_on: s.ends_on,
      })),
    };
    const afterSnapshot = { segments, total_price: pricingAfter - waived, quote: body.quote ?? null };

    const paymentStatus = finalAmount > 0
      ? "pending"
      : waived > 0 && calculated > 0
        ? "waived"
        : finalAmount < 0
          ? "credit_due"
          : "not_required";

    const { data: modification, error: modErr } = await admin
      .from("stay_modifications")
      .insert({
        booking_id: bookingId,
        kind,
        reason_code: reasonCode,
        notes,
        before_snapshot: beforeSnapshot,
        after_snapshot: afterSnapshot,
        pricing_before: pricingBefore,
        pricing_after: pricingAfter,
        calculated_amount: calculated,
        waived_amount: waived,
        final_amount: finalAmount,
        status: finalAmount > 0 ? "pending_payment" : "committed",
        payment_status: paymentStatus,
        actor_id: user.id,
        actor_email: user.email ?? null,
        actor_role: actorRole,
      })
      .select()
      .single();

    if (modErr || !modification) {
      console.error("[modify-stay] modification insert failed:", modErr);
      return jsonResponse(req, { error: "Could not record the modification" }, 500);
    }

    // Replace inventory: release the old legs, write the new ones.
    if ((existingSegments ?? []).length > 0) {
      const { error: relErr } = await admin
        .from("booking_segments")
        .update({ status: "released", modification_id: modification.id, updated_at: new Date().toISOString() })
        .eq("booking_id", bookingId)
        .in("status", ["active", "pending"]);
      if (relErr) {
        console.error("[modify-stay] release failed:", relErr);
        return jsonResponse(req, { error: "Could not release the previous room hold" }, 500);
      }
    }

    const { error: insErr } = await admin.from("booking_segments").insert(
      segments.map((s) => ({
        booking_id: bookingId,
        unit_id: s.unit_id,
        property_id: booking.property_id ?? null,
        starts_on: s.starts_on,
        ends_on: s.ends_on,
        status: "active",
        modification_id: modification.id,
        created_by: user.id,
      })),
    );

    if (insErr) {
      console.error("[modify-stay] segment insert failed:", insErr);
      // Put the old legs back so the stay is never left holding nothing.
      await admin
        .from("booking_segments")
        .update({ status: "active" })
        .eq("booking_id", bookingId)
        .eq("modification_id", modification.id)
        .eq("status", "released");
      await admin
        .from("stay_modifications")
        .update({ status: "cancelled", payment_status: "not_required" })
        .eq("id", modification.id);
      return jsonResponse(req, {
        error: "segment_conflict",
        message: "Those nights were taken while you were reviewing. Nothing was changed.",
      }, 409);
    }

    // Keep the flat booking columns (used by calendar, housekeeping, arrivals,
    // emails and iCal) in step with the segments.
    const { error: syncErr } = await admin.rpc("sync_booking_from_segments", { _booking_id: bookingId });
    if (syncErr) console.error("[modify-stay] sync_booking_from_segments failed:", syncErr);

    const newTotal = Math.round((pricingAfter - waived) * 100) / 100;
    await admin
      .from("bookings")
      .update({ total_price: newTotal, updated_at: new Date().toISOString() })
      .eq("id", bookingId);

    // A waived difference is real money given away — it belongs in the
    // adjustments ledger next to discounts, not buried in a snapshot.
    if (waived > 0) {
      await admin.from("booking_adjustments").insert({
        booking_id: bookingId,
        adjustment_type: "discount",
        value_type: "fixed",
        value: waived,
        amount_calculated: waived,
        label: `Modification charge waived (${kind.replace(/_/g, " ")})`,
        internal_note: notes,
        applies_to: "accommodation_subtotal",
        status: "active",
        applied_by: user.id,
        modification_id: modification.id,
      });
    }

    // Attribution: never let a stay change land without a named actor.
    await admin.rpc("log_override_event", {
      _action_type: "stay_modification",
      _target_type: "booking",
      _target_id: bookingId,
      _booking_id: bookingId,
      _room_id: segments[0]?.unit_id ?? null,
      _before_state: beforeSnapshot,
      _after_state: afterSnapshot,
      _reason: `${reasonCode}${notes ? `: ${notes}` : ""}`,
      _source: "modify-stay",
      _metadata: {
        modification_id: modification.id,
        kind,
        calculated_amount: calculated,
        waived_amount: waived,
        final_amount: finalAmount,
        forced_over_conflict: conflicts.length > 0,
      },
    }).catch?.((e: unknown) => console.error("[modify-stay] override log failed:", e));

    // Payment request for the difference only.
    let paymentLink: Record<string, unknown> | null = null;
    let paymentLinkError: string | null = null;
    if (finalAmount > 0 && body.request_payment !== false) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/create-payment-link`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            apikey: anonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            booking_id: bookingId,
            collect: "balance",
            amount: Math.round(finalAmount),
            regenerate: true,
          }),
        });
        const json = await resp.json().catch(() => ({}));
        if (resp.ok) {
          paymentLink = json;
          await admin.from("stay_modifications").update({
            payment_status: "pending",
            updated_at: new Date().toISOString(),
          }).eq("id", modification.id);
        } else {
          paymentLinkError = String((json as any)?.message ?? (json as any)?.error ?? "Payment link could not be created");
        }
      } catch (e) {
        paymentLinkError = e instanceof Error ? e.message : "Payment link request failed";
      }
    }

    return jsonResponse(req, {
      ok: true,
      modification,
      new_total: newTotal,
      calculated_amount: calculated,
      waived_amount: waived,
      final_amount: finalAmount,
      payment_link: paymentLink,
      payment_link_error: paymentLinkError,
      conflicts,
    });
  } catch (err) {
    console.error("[modify-stay] error:", err);
    return jsonResponse(req, { error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
