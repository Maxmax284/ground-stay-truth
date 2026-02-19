import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const unitId = url.searchParams.get("unit_id");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // If unitId provided, return single unit + availability
    // Otherwise return all active units
    // Fetch currency symbol from policy_settings
    const { data: currencyRow } = await supabase
      .from("policy_settings")
      .select("value")
      .eq("key", "currency_symbol")
      .maybeSingle();
    const currencySymbol = currencyRow?.value ? String(currencyRow.value).replace(/^"|"$/g, "") : "฿";

    if (unitId) {
      const { data: unit, error: unitError } = await supabase
        .from("units")
        .select("id, name, description, capacity, base_price, weekend_price, cleaning_fee, min_nights, amenities, photos")
        .eq("id", unitId)
        .eq("is_active", true)
        .maybeSingle();

      if (unitError) throw unitError;
      if (!unit) {
        return new Response(JSON.stringify({ error: "Unit not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get blocked dates from bookings
      const { data: bookings } = await supabase
        .from("bookings")
        .select("check_in, check_out")
        .eq("unit_id", unitId)
        .in("state", ["pending_approval", "pending_deposit", "confirmed", "checked_in"])
        .gte("check_out", new Date().toISOString().split("T")[0]);

      // Get maintenance blocks
      const { data: maintenance } = await supabase
        .from("maintenance_blocks")
        .select("start_date, end_date")
        .eq("unit_id", unitId)
        .gte("end_date", new Date().toISOString().split("T")[0]);

      const blockedRanges = [
        ...(bookings ?? []).map((b) => ({ start: b.check_in, end: b.check_out })),
        ...(maintenance ?? []).map((m) => ({ start: m.start_date, end: m.end_date })),
      ];

      return new Response(JSON.stringify({ unit, blockedRanges, currencySymbol }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All active units
    const { data: units, error } = await supabase
      .from("units")
      .select("id, name, description, capacity, base_price, weekend_price, cleaning_fee, min_nights, amenities, photos")
      .eq("is_active", true)
      .order("name");

    if (error) throw error;

    return new Response(JSON.stringify({ units, currencySymbol }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
