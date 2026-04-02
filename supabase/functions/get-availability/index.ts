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
    const groupId = url.searchParams.get("group_id");
    const mode = url.searchParams.get("mode"); // "groups" returns room types

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch currency symbol from policy_settings
    const { data: currencyRow } = await supabase
      .from("policy_settings")
      .select("value")
      .eq("key", "currency_symbol")
      .maybeSingle();
    const currencySymbol = currencyRow?.value ? String(currencyRow.value).replace(/^"|"$/g, "") : "฿";

    // MODE: Return room types (unit groups) with representative info
    if (mode === "groups") {
      const { data: groups, error: gErr } = await supabase
        .from("unit_groups")
        .select("id, name, description, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (gErr) throw gErr;

      const { data: units, error: uErr } = await supabase
        .from("units")
        .select("id, group_id, base_price, capacity, min_nights, amenities, photos, cleaning_fee, weekend_price, description")
        .eq("is_active", true)
        .order("sort_order");
      if (uErr) throw uErr;

      const roomTypes = (groups ?? []).map((g: any) => {
        const groupUnits = (units ?? []).filter((u: any) => u.group_id === g.id);
        const rep = groupUnits[0];
        return {
          id: g.id,
          name: g.name,
          description: rep?.description || g.description,
          unitCount: groupUnits.length,
          base_price: rep?.base_price ?? 0,
          weekend_price: rep?.weekend_price ?? null,
          capacity: rep?.capacity ?? 2,
          min_nights: rep?.min_nights ?? 1,
          amenities: rep?.amenities ?? [],
          photos: rep?.photos ?? [],
          cleaning_fee: rep?.cleaning_fee ?? 0,
        };
      });

      return new Response(JSON.stringify({ roomTypes, currencySymbol }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MODE: Single unit by ID (existing behavior)
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

      const { data: bookings } = await supabase
        .from("bookings")
        .select("check_in, check_out")
        .eq("unit_id", unitId)
        .in("state", ["pending_approval", "pending_deposit", "confirmed", "checked_in"])
        .gte("check_out", new Date().toISOString().split("T")[0]);

      const { data: maintenance } = await supabase
        .from("maintenance_blocks")
        .select("start_date, end_date")
        .eq("unit_id", unitId)
        .gte("end_date", new Date().toISOString().split("T")[0]);

      const blockedRanges = [
        ...(bookings ?? []).map((b: any) => ({ start: b.check_in, end: b.check_out })),
        ...(maintenance ?? []).map((m: any) => ({ start: m.start_date, end: m.end_date })),
      ];

      return new Response(JSON.stringify({ unit, blockedRanges, currencySymbol }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MODE: Group availability - blocked dates across all units in group
    if (groupId) {
      const { data: groupUnits, error: guErr } = await supabase
        .from("units")
        .select("id, name, description, capacity, base_price, weekend_price, cleaning_fee, min_nights, amenities, photos")
        .eq("group_id", groupId)
        .eq("is_active", true)
        .order("sort_order");
      if (guErr) throw guErr;

      const rep = groupUnits?.[0];
      if (!rep) {
        return new Response(JSON.stringify({ error: "Room type not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get the group name
      const { data: group } = await supabase
        .from("unit_groups")
        .select("name")
        .eq("id", groupId)
        .single();

      const unitIds = (groupUnits ?? []).map((u: any) => u.id);

      const { data: bookings } = await supabase
        .from("bookings")
        .select("unit_id, check_in, check_out")
        .in("unit_id", unitIds)
        .in("state", ["pending_approval", "pending_deposit", "confirmed", "checked_in"])
        .gte("check_out", new Date().toISOString().split("T")[0]);

      const { data: maintenance } = await supabase
        .from("maintenance_blocks")
        .select("unit_id, start_date, end_date")
        .in("unit_id", unitIds)
        .gte("end_date", new Date().toISOString().split("T")[0]);

      // A date is only blocked if ALL units in the group are blocked
      // Collect all blocked ranges per unit
      const unitBlockedMap = new Map<string, { start: string; end: string }[]>();
      for (const uid of unitIds) {
        const ranges = [
          ...(bookings ?? []).filter((b: any) => b.unit_id === uid).map((b: any) => ({ start: b.check_in, end: b.check_out })),
          ...(maintenance ?? []).filter((m: any) => m.unit_id === uid).map((m: any) => ({ start: m.start_date, end: m.end_date })),
        ];
        unitBlockedMap.set(uid, ranges);
      }

      // For the calendar widget, show the representative unit info with group-level blocking
      const unit = {
        ...rep,
        name: group?.name ?? rep.name,
      };

      // Only show blocked dates where ALL units are unavailable
      // For simplicity, return union of all blocked ranges - the auto-assign handles actual availability
      const allRanges = Array.from(unitBlockedMap.values()).flat();

      return new Response(JSON.stringify({ unit, blockedRanges: allRanges, currencySymbol, unitCount: unitIds.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All active units with property info
    const { data: units, error } = await supabase
      .from("units")
      .select("id, name, description, capacity, base_price, weekend_price, cleaning_fee, min_nights, amenities, photos, property_id")
      .eq("is_active", true)
      .order("base_price", { ascending: true });

    if (error) throw error;

    // Fetch active properties for labeling
    const { data: properties } = await supabase
      .from("properties")
      .select("id, name, slug, operational_mode")
      .eq("is_active", true)
      .order("name");

    return new Response(JSON.stringify({ units, properties: properties ?? [], currencySymbol }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
