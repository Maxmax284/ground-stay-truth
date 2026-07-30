// availability-consistency-check
// -----------------------------------------------------------------------------
import { emitAdminAlert } from "../_shared/adminAlert.ts";
// Compares two independent availability signals for the same group + window
// and logs any discrepancy for admin review:
//
//   1. "Calendar signal" — the same overlap sweep get-availability uses to
//      paint the guest-facing mini-calendar (intersection across siblings).
//   2. "RPC signal" — assign_unit_for_group, the authoritative picker the
//      booking form actually uses at submit time.
//
// If those disagree (e.g. calendar says "blocked" but RPC hands back a unit —
// the exact bug pattern Nikki hit), we insert a `staff_audit_events` row so
// admins can spot the drift in the audit log without the guest ever knowing.
//
// Anonymous, read-only, safe to fire-and-forget from the client.
// -----------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BLOCKING_STATES = [
  "inquiry",
  "soft_hold",
  "pending_approval",
  "pending_deposit",
  "confirmed",
  "checked_in",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const group_id: string | undefined = body.group_id;
    const check_in: string | undefined = body.check_in;
    const check_out: string | undefined = body.check_out;
    const source: string = body.source ?? "unknown";

    if (!group_id || !check_in || !check_out) {
      return new Response(
        JSON.stringify({ error: "group_id, check_in, check_out required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- Signal 1: calendar sweep (same logic as get-availability group mode)
    const { data: units, error: uErr } = await admin
      .from("units")
      .select("id, name, sort_order")
      .eq("group_id", group_id)
      .eq("is_active", true);
    if (uErr) throw uErr;

    const unitIds = (units ?? []).map((u: any) => u.id);
    if (unitIds.length === 0) {
      return new Response(
        JSON.stringify({ consistent: true, reason: "no_units_in_group" }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const [{ data: bookings }, { data: maintenance }] = await Promise.all([
      admin
        .from("bookings")
        .select("unit_id, check_in, check_out")
        .in("unit_id", unitIds)
        .in("state", BLOCKING_STATES)
        .lt("check_in", check_out)
        .gt("check_out", check_in),
      admin
        .from("maintenance_blocks")
        .select("unit_id, start_date, end_date")
        .in("unit_id", unitIds)
        .lt("start_date", check_out)
        .gt("end_date", check_in),
    ]);

    const blockedUnitIds = new Set<string>();
    for (const b of bookings ?? []) blockedUnitIds.add((b as any).unit_id);
    for (const m of maintenance ?? []) blockedUnitIds.add((m as any).unit_id);

    const calendarFreeUnits = unitIds.filter((id) => !blockedUnitIds.has(id));
    const calendarAvailable = calendarFreeUnits.length > 0;

    // --- Signal 2: authoritative RPC
    const { data: rpcRows, error: rpcErr } = await admin.rpc(
      "assign_unit_for_group",
      { _group_id: group_id, _check_in: check_in, _check_out: check_out },
    );
    if (rpcErr) throw rpcErr;
    const rpc = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    const rpcAvailable = !!rpc?.unit_id;

    const consistent = calendarAvailable === rpcAvailable;

    if (!consistent) {
      // Log for admin review. Actor is null (anonymous public flow).
      await admin.rpc("log_staff_audit_event", {
        _event_type: "ops.availability_drift",
        _severity: "warning",
        _actor_id: null,
        _reason:
          `Availability signals disagree for group ${group_id} ` +
          `${check_in}→${check_out}: calendar=${calendarAvailable}, rpc=${rpcAvailable}`,
        _metadata: {
          source,
          group_id,
          check_in,
          check_out,
          calendar_available: calendarAvailable,
          calendar_free_unit_ids: calendarFreeUnits,
          rpc_available: rpcAvailable,
          rpc_unit_id: rpc?.unit_id ?? null,
          rpc_available_count: rpc?.available_count ?? null,
          rpc_total_count: rpc?.total_count ?? null,
          unit_count: unitIds.length,
        },
      });
    }

    if (!consistent) {
      await emitAdminAlert(
        "calendar_mismatch",
        `Availability signals disagree for ${check_in}→${check_out}: calendar says ${calendarAvailable ? "free" : "blocked"}, the booking engine says ${rpcAvailable ? "free" : "blocked"}.`,
        { deepLink: "/calendar", context: { group_id, check_in, check_out, calendar_available: calendarAvailable, rpc_available: rpcAvailable, source } },
      );
    }

    return new Response(
      JSON.stringify({
        consistent,
        calendar_available: calendarAvailable,
        rpc_available: rpcAvailable,
        rpc_unit_id: rpc?.unit_id ?? null,
        unit_count: unitIds.length,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error(JSON.stringify({
      level: "ERROR",
      function: "availability-consistency-check",
      error: err?.message,
      stack: err?.stack,
    }));
    return new Response(
      JSON.stringify({ error: err?.message ?? "unknown" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
