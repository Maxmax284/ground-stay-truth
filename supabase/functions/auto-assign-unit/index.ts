// auto-assign-unit
// -----------------------------------------------------------------------------
// BUSINESS-CRITICAL. When someone books a "room type" instead of a specific
// unit, this picks which physical unit inside the group they actually get.
//
// The real assignment is done by the DB function `assign_unit_for_group()`
// which uses `FOR UPDATE SKIP LOCKED` so two concurrent bookings can't grab
// the same unit. That lock is the whole point — don't reimplement in JS.
//
// Availability filter must match `BLOCKING_STATES` from `bookingStateMachine.ts`
// or the calendar and the assigner will disagree.
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
  if (/^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  return false;
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

/**
 * Thin wrapper around the SECURITY DEFINER RPC `assign_unit_for_group`.
 *
 * The RPC does the atomic lookup under FOR UPDATE SKIP LOCKED — this edge
 * function is now only here for back-compat with the existing client hook
 * (`useAutoAssignUnit`) and to expose a friendly JSON response.
 *
 * Note: this endpoint is advisory only. Two callers in flight can both
 * receive the same `unit_id` because the RPC's lock is released at end of
 * statement. The atomic-at-insert-time guarantee comes from
 * `assign_and_create_booking` (called at submit time by the guest form).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const { group_id, check_in, check_out } = await req.json();

    if (!group_id || !check_in || !check_out) {
      return new Response(
        JSON.stringify({ error: "group_id, check_in, and check_out are required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase.rpc("assign_unit_for_group", {
      _group_id: group_id,
      _check_in: check_in,
      _check_out: check_out,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    const picked = row?.unit_id ?? null;

    if (!picked) {
      return new Response(
        JSON.stringify({
          available: false,
          available_count: row?.available_count ?? 0,
          total_count: row?.total_count ?? 0,
          error: "No rooms available for the selected dates",
        }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        available: true,
        unit_id: picked,
        unit_name: row?.unit_name,
        available_count: row?.available_count ?? 1,
        total_count: row?.total_count ?? 1,
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
