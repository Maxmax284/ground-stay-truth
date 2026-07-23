// Admin/manager discretionary discount (or surcharge) for a booking.
// BUSINESS-CRITICAL — mutates booking.total_price and pending payment
// obligations. Guarded to run only when no payment has been recorded.
//
// Actions:
//   - action: "apply"  → insert booking_adjustments row, recompute total,
//                        update pending deposit + booking_fee amounts,
//                        revoke unpaid payment links.
//   - action: "void"   → mark adjustment voided, restore total, recompute.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflight, jsonResponse, getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ApplyBody {
  action: "apply";
  bookingId: string;
  valueType: "percent" | "fixed";
  value: number;
  label: string;
  internalNote?: string;
  adjustmentType?: "discount" | "surcharge";
}
interface VoidBody {
  action: "void";
  adjustmentId: string;
  reason?: string;
}

const RECORDED_STATUSES = new Set(["recorded", "succeeded", "captured", "completed"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(req);
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return jsonResponse(req, { error: "Unauthorized" }, 401);
  const token = auth.slice(7);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return jsonResponse(req, { error: "Invalid session" }, 401);

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const roleSet = new Set((roles ?? []).map((r: any) => r.role));
  if (!roleSet.has("admin") && !roleSet.has("manager")) {
    return jsonResponse(req, { error: "admin or manager only" }, 403);
  }

  let body: ApplyBody | VoidBody;
  try { body = await req.json(); } catch { return jsonResponse(req, { error: "Invalid JSON" }, 400); }

  try {
    if (body.action === "apply") {
      return await handleApply(req, admin, user.id, body);
    } else if (body.action === "void") {
      return await handleVoid(req, admin, user.id, body);
    }
    return jsonResponse(req, { error: "Unknown action" }, 400);
  } catch (e: any) {
    console.error("apply-booking-adjustment error", e);
    return jsonResponse(req, { error: e?.message || "internal error" }, 500);
  }
});

async function handleApply(req: Request, admin: any, userId: string, body: ApplyBody) {
  const { bookingId, valueType, value, label, internalNote } = body;
  const adjustmentType = body.adjustmentType || "discount";

  if (!bookingId || !label?.trim()) return jsonResponse(req, { error: "bookingId and label required" }, 400);
  if (!["percent", "fixed"].includes(valueType)) return jsonResponse(req, { error: "invalid valueType" }, 400);
  if (typeof value !== "number" || !isFinite(value) || value <= 0) return jsonResponse(req, { error: "value must be > 0" }, 400);
  if (valueType === "percent" && value > 100) return jsonResponse(req, { error: "percent cannot exceed 100" }, 400);

  const { data: booking, error: bErr } = await admin.from("bookings").select("*").eq("id", bookingId).maybeSingle();
  if (bErr || !booking) return jsonResponse(req, { error: "Booking not found" }, 404);

  if (["cancelled", "completed", "no_show"].includes(booking.state)) {
    return jsonResponse(req, { error: `Cannot adjust booking in state '${booking.state}'` }, 409);
  }

  const { data: existingPayments } = await admin
    .from("payments").select("id,status").eq("booking_id", bookingId);
  const hasRecorded = (existingPayments ?? []).some((p: any) => RECORDED_STATUSES.has(String(p.status)));
  if (hasRecorded) {
    return jsonResponse(req, { error: "Payment already recorded — use refund/adjustment workflow", code: "PAYMENT_RECORDED" }, 409);
  }

  // Baseline for calculation: use original_total if set, else current total_price.
  const originalTotal = Number(booking.original_total ?? booking.total_price ?? 0);
  if (originalTotal <= 0) return jsonResponse(req, { error: "Booking has no total to adjust" }, 400);

  // Sum other active adjustments (should typically be zero in Phase 1 single-adjustment UI).
  const { data: activeAdj } = await admin
    .from("booking_adjustments")
    .select("id,adjustment_type,amount_calculated")
    .eq("booking_id", bookingId)
    .eq("status", "active");
  const otherAdjNet = (activeAdj ?? []).reduce((s: number, a: any) => {
    const amt = Number(a.amount_calculated) || 0;
    return s + (a.adjustment_type === "discount" ? -amt : amt);
  }, 0);

  const amountCalc = valueType === "percent"
    ? Math.round(originalTotal * (value / 100) * 100) / 100
    : Math.round(value * 100) / 100;

  const signed = adjustmentType === "discount" ? -amountCalc : amountCalc;
  const newTotal = Math.round((originalTotal + otherAdjNet + signed) * 100) / 100;

  if (newTotal <= 0) {
    return jsonResponse(req, { error: "Adjustment would zero out or invert the booking total. Reduce the discount." }, 400);
  }

  // 1. Insert adjustment
  const { data: adjRow, error: adjErr } = await admin.from("booking_adjustments").insert({
    booking_id: bookingId,
    adjustment_type: adjustmentType,
    value_type: valueType,
    value,
    amount_calculated: amountCalc,
    label: label.trim(),
    internal_note: internalNote?.trim() || null,
    applies_to: "accommodation_subtotal",
    status: "active",
    applied_by: userId,
  }).select().single();
  if (adjErr) return jsonResponse(req, { error: adjErr.message }, 500);

  // 2. Update booking total (preserve original)
  const { error: updErr } = await admin.from("bookings").update({
    original_total: booking.original_total ?? originalTotal,
    total_price: newTotal,
  }).eq("id", bookingId);
  if (updErr) return jsonResponse(req, { error: updErr.message }, 500);

  // 3. Recompute pending deposit obligation
  const { data: policies } = await admin
    .from("policy_settings")
    .select("key,value,property_id")
    .in("key", ["deposit_percentage", "booking_fee_enabled", "booking_fee_mode", "booking_fee_percentage", "booking_fee_fixed"]);
  const readPol = (key: string) => {
    const rows = (policies ?? []).filter((p: any) => p.key === key);
    const scoped = rows.find((r: any) => r.property_id === booking.property_id);
    const global = rows.find((r: any) => r.property_id == null);
    const raw = (scoped ?? global)?.value;
    if (raw == null) return null;
    return typeof raw === "string" ? raw.replace(/"/g, "") : String(raw);
  };
  const depositPct = Number(readPol("deposit_percentage") ?? 20);
  const newDeposit = Math.round(newTotal * depositPct / 100 * 100) / 100;

  const { data: pendingDeposits } = await admin.from("payments")
    .select("id").eq("booking_id", bookingId)
    .eq("payment_type", "deposit").eq("status", "pending");
  for (const p of pendingDeposits ?? []) {
    await admin.from("payments").update({
      amount: newDeposit,
      description: `Deposit obligation (recalculated after adjustment) — ${depositPct}% of ${newTotal}`,
    }).eq("id", p.id);
  }

  // 4. Recompute pending booking_fee if configured as separate
  const feeEnabled = readPol("booking_fee_enabled") === "true";
  const feeMode = readPol("booking_fee_mode") ?? "separate";
  if (feeEnabled && feeMode !== "included") {
    const feePct = Number(readPol("booking_fee_percentage") ?? 0);
    const feeFixed = Number(readPol("booking_fee_fixed") ?? 0);
    const newFee = Math.round(((newTotal * feePct) / 100 + feeFixed) * 100) / 100;
    if (newFee > 0) {
      const { data: pendingFees } = await admin.from("payments")
        .select("id").eq("booking_id", bookingId)
        .eq("payment_type", "booking_fee").eq("status", "pending");
      for (const p of pendingFees ?? []) {
        await admin.from("payments").update({ amount: newFee }).eq("id", p.id);
      }
    }
  }

  // 5. Revoke unpaid payment links
  const { data: revokedLinks } = await admin.from("payment_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("booking_id", bookingId)
    .is("used_at", null)
    .is("revoked_at", null)
    .select("id");
  const revokedCount = revokedLinks?.length ?? 0;

  if (revokedCount > 0) {
    await admin.from("payment_link_events").insert({
      booking_id: bookingId,
      event_type: "revoked_on_adjustment",
      actor_role: "admin",
      context: { adjustment_id: adjRow.id, revoked_count: revokedCount },
    });
  }

  // 6. Audit log
  await admin.rpc("log_staff_audit_event", {
    _event_type: "booking.adjustment.applied",
    _severity: "info",
    _actor_id: userId,
    _target_user_id: booking.guest_id,
    _reason: label,
    _metadata: {
      booking_id: bookingId,
      adjustment_id: adjRow.id,
      adjustment_type: adjustmentType,
      value_type: valueType,
      value,
      amount_calculated: amountCalc,
      old_total: originalTotal,
      new_total: newTotal,
      new_deposit: newDeposit,
      revoked_links: revokedCount,
      internal_note: internalNote ?? null,
    },
  });

  return jsonResponse(req, {
    success: true,
    adjustment: adjRow,
    oldTotal: originalTotal,
    newTotal,
    newDeposit,
    revokedLinks: revokedCount,
  });
}

async function handleVoid(req: Request, admin: any, userId: string, body: VoidBody) {
  const { adjustmentId, reason } = body;
  if (!adjustmentId) return jsonResponse(req, { error: "adjustmentId required" }, 400);

  const { data: adj, error: aErr } = await admin.from("booking_adjustments")
    .select("*").eq("id", adjustmentId).maybeSingle();
  if (aErr || !adj) return jsonResponse(req, { error: "Adjustment not found" }, 404);
  if (adj.status !== "active") return jsonResponse(req, { error: "Adjustment already voided" }, 409);

  const { data: existingPayments } = await admin.from("payments").select("status").eq("booking_id", adj.booking_id);
  const hasRecorded = (existingPayments ?? []).some((p: any) => RECORDED_STATUSES.has(String(p.status)));
  if (hasRecorded) {
    return jsonResponse(req, { error: "Payment already recorded — voiding requires refund workflow" }, 409);
  }

  const { data: booking } = await admin.from("bookings").select("*").eq("id", adj.booking_id).maybeSingle();
  if (!booking) return jsonResponse(req, { error: "Booking not found" }, 404);

  await admin.from("booking_adjustments").update({
    status: "voided",
    voided_by: userId,
    voided_at: new Date().toISOString(),
    void_reason: reason ?? null,
  }).eq("id", adjustmentId);

  // Recompute total from original_total and remaining active adjustments
  const originalTotal = Number(booking.original_total ?? booking.total_price ?? 0);
  const { data: activeAdj } = await admin.from("booking_adjustments")
    .select("adjustment_type,amount_calculated")
    .eq("booking_id", adj.booking_id).eq("status", "active");
  const net = (activeAdj ?? []).reduce((s: number, a: any) => {
    const amt = Number(a.amount_calculated) || 0;
    return s + (a.adjustment_type === "discount" ? -amt : amt);
  }, 0);
  const newTotal = Math.round((originalTotal + net) * 100) / 100;

  await admin.from("bookings").update({ total_price: newTotal }).eq("id", adj.booking_id);

  // Recompute pending deposit
  const { data: pol } = await admin.from("policy_settings").select("key,value,property_id").eq("key", "deposit_percentage");
  const scoped = (pol ?? []).find((r: any) => r.property_id === booking.property_id);
  const global = (pol ?? []).find((r: any) => r.property_id == null);
  const raw = (scoped ?? global)?.value;
  const depositPct = Number((typeof raw === "string" ? raw.replace(/"/g, "") : raw) ?? 20);
  const newDeposit = Math.round(newTotal * depositPct / 100 * 100) / 100;

  const { data: pendingDeposits } = await admin.from("payments")
    .select("id").eq("booking_id", adj.booking_id).eq("payment_type", "deposit").eq("status", "pending");
  for (const p of pendingDeposits ?? []) {
    await admin.from("payments").update({ amount: newDeposit }).eq("id", p.id);
  }

  await admin.from("payment_links").update({ revoked_at: new Date().toISOString() })
    .eq("booking_id", adj.booking_id).is("used_at", null).is("revoked_at", null);

  await admin.rpc("log_staff_audit_event", {
    _event_type: "booking.adjustment.voided",
    _severity: "info",
    _actor_id: userId,
    _target_user_id: booking.guest_id,
    _reason: reason ?? "voided",
    _metadata: {
      booking_id: adj.booking_id,
      adjustment_id: adjustmentId,
      restored_total: newTotal,
      new_deposit: newDeposit,
    },
  });

  return jsonResponse(req, { success: true, newTotal, newDeposit });
}
