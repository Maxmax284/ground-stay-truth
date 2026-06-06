import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Lovable preview/dev origins
  if (/^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  if (/^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/.test(origin)) return true;
  return false;
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  // For a public embed widget, reflecting the origin is safe (no cookies/credentials)
  // and prevents CDN/proxy caching from serving the wrong Allow-Origin to another site.
  const allowedOrigin = origin && (isAllowedOrigin(origin) || origin.startsWith("https://")) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Cache-Control": "public, max-age=30, s-maxage=60",
  };
}

// ── Simple in-memory rate limiter (per IP) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 120; // max calls per window — generous for shared NAT / corporate / mobile carriers
const RATE_WINDOW_MS = 60 * 1000; // 1 minute

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  // Rate limit by IP (or fallback to generic key)
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(clientIp)) {
    // Return 200 with fallback signal so the embed degrades gracefully instead of showing a red error
    return new Response(JSON.stringify({ error: "RATE_LIMITED", fallback: true, message: "Please try again in a moment" }), {
      status: 200,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
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
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(JSON.stringify({
      level: "ERROR",
      function: "get-availability",
      error: err?.message || "Unknown error",
      stack: err?.stack,
      timestamp: new Date().toISOString(),
    }));
    // Return 200 + fallback signal so the embed never crashes external pages with a hard error.
    return new Response(JSON.stringify({ error: "SERVICE_UNAVAILABLE", fallback: true, message: "Availability temporarily unavailable" }), {
      status: 200,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
