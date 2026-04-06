import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

function icalDate(d: string): string {
  // Convert YYYY-MM-DD to YYYYMMDD (VALUE=DATE)
  return d.replace(/-/g, "");
}

function escapeIcal(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function uid(id: string, type: string): string {
  return `${id}-${type}@groundstay`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const unitId = url.searchParams.get("unit_id");

    if (!unitId) {
      return new Response(JSON.stringify({ error: "unit_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch unit name
    const { data: unit, error: unitErr } = await supabase
      .from("units")
      .select("name")
      .eq("id", unitId)
      .single();

    if (unitErr || !unit) {
      return new Response(JSON.stringify({ error: "Unit not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch active bookings (not cancelled/no_show) - past 6 months + future
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const cutoff = sixMonthsAgo.toISOString().split("T")[0];

    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, check_in, check_out, state, notes")
      .eq("unit_id", unitId)
      .gte("check_out", cutoff)
      .not("state", "in", '("cancelled","no_show","inquiry")');

    // Fetch maintenance blocks
    const { data: blocks } = await supabase
      .from("maintenance_blocks")
      .select("id, start_date, end_date, reason")
      .eq("unit_id", unitId)
      .gte("end_date", cutoff);

    // Build iCal
    const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      `PRODID:-//GroundStay//${escapeIcal(unit.name)}//EN`,
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeIcal(unit.name)} - Blocked Dates`,
    ];

    // Add bookings as VEVENT
    for (const b of bookings ?? []) {
      const summary =
        b.state === "checked_in"
          ? "Occupied"
          : b.state === "completed"
          ? "Past Stay"
          : "Reserved";

      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid(b.id, "booking")}`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${icalDate(b.check_in)}`,
        `DTEND;VALUE=DATE:${icalDate(b.check_out)}`,
        `SUMMARY:${escapeIcal(summary)}`,
        `STATUS:CONFIRMED`,
        "TRANSP:OPAQUE",
        "END:VEVENT"
      );
    }

    // Add maintenance blocks
    for (const m of blocks ?? []) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid(m.id, "maintenance")}`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${icalDate(m.start_date)}`,
        `DTEND;VALUE=DATE:${icalDate(m.end_date)}`,
        `SUMMARY:${escapeIcal("Maintenance" + (m.reason ? `: ${m.reason}` : ""))}`,
        `STATUS:CONFIRMED`,
        "TRANSP:OPAQUE",
        "END:VEVENT"
      );
    }

    lines.push("END:VCALENDAR");
    const ical = lines.join("\r\n");

    return new Response(ical, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${unit.name.replace(/[^a-zA-Z0-9]/g, "_")}.ics"`,
      },
    });
  } catch (e) {
    console.error("ical-export error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
