import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { group_id, check_in, check_out } = await req.json();

    if (!group_id || !check_in || !check_out) {
      return new Response(JSON.stringify({ error: "group_id, check_in, and check_out are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all active units in this group, ordered by sort_order
    const { data: units, error: unitsError } = await supabase
      .from("units")
      .select("id, name, sort_order")
      .eq("group_id", group_id)
      .eq("is_active", true)
      .order("sort_order");

    if (unitsError) throw unitsError;
    if (!units || units.length === 0) {
      return new Response(JSON.stringify({ error: "No units available in this room type" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const unitIds = units.map((u: any) => u.id);

    // Get all bookings that overlap with the requested dates for units in this group
    const { data: conflictingBookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("unit_id")
      .in("unit_id", unitIds)
      .in("state", ["inquiry", "soft_hold", "pending_approval", "pending_deposit", "confirmed", "checked_in"])
      .lt("check_in", check_out)
      .gt("check_out", check_in);

    if (bookingsError) throw bookingsError;

    // Get maintenance blocks that overlap
    const { data: maintenanceBlocks, error: mbError } = await supabase
      .from("maintenance_blocks")
      .select("unit_id")
      .in("unit_id", unitIds)
      .lt("start_date", check_out)
      .gt("end_date", check_in);

    if (mbError) throw mbError;

    const occupiedUnitIds = new Set([
      ...(conflictingBookings ?? []).map((b: any) => b.unit_id),
      ...(maintenanceBlocks ?? []).map((m: any) => m.unit_id),
    ]);

    // Find first available unit (by sort_order)
    const availableUnit = units.find((u: any) => !occupiedUnitIds.has(u.id));

    if (!availableUnit) {
      return new Response(JSON.stringify({ error: "No rooms available for the selected dates", available: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const availableCount = units.filter((u: any) => !occupiedUnitIds.has(u.id)).length;

    return new Response(JSON.stringify({
      available: true,
      unit_id: availableUnit.id,
      unit_name: availableUnit.name,
      available_count: availableCount,
      total_count: units.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
