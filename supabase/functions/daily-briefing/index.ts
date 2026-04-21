// daily-briefing — sends a clean morning briefing to admin + manager users
// via their linked messaging channels (Telegram / WhatsApp / SMS).
//
// Triggered by pg_cron at ~08:00 Asia/Bangkok (01:00 UTC).
//
// Pulls today's arrivals/departures, occupancy, open issues, pending approvals
// and unpaid deposits, then dispatches via notify-via-messaging using the
// `daily_briefing` event type so per-user prefs are still respected.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function todayInBangkok(): string {
  // Asia/Bangkok = UTC+7, no DST
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return bkk.toISOString().slice(0, 10);
}

async function buildBriefing(admin: any): Promise<string> {
  const today = todayInBangkok();

  const [arrRes, depRes, occRes, unitsRes, pendApr, pendDep, openMaint] = await Promise.all([
    admin.from("bookings")
      .select("check_in, num_guests, units(name), profiles!bookings_guest_id_profiles_fkey(full_name)")
      .eq("check_in", today)
      .in("state", ["confirmed", "pending_deposit", "checked_in"])
      .limit(20),
    admin.from("bookings")
      .select("units(name), profiles!bookings_guest_id_profiles_fkey(full_name)")
      .eq("check_out", today)
      .eq("state", "checked_in")
      .limit(20),
    admin.from("bookings").select("id", { count: "exact", head: true })
      .lte("check_in", today).gt("check_out", today).eq("state", "checked_in"),
    admin.from("units").select("id", { count: "exact", head: true }).eq("is_active", true),
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("state", "pending_approval"),
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("state", "pending_deposit"),
    admin.from("maintenance_requests").select("id", { count: "exact", head: true }).neq("status", "resolved"),
  ]);

  // Try to fetch arrival pickup times where available
  const arrivalIds = (arrRes.data ?? []).map((b: any) => b.id).filter(Boolean);
  const pickupMap = new Map<string, string>();
  if (arrivalIds.length) {
    const { data: pickups } = await admin
      .from("airport_pickups")
      .select("booking_id, arrival_datetime")
      .in("booking_id", arrivalIds);
    (pickups ?? []).forEach((p: any) => {
      if (p.arrival_datetime) {
        const t = new Date(p.arrival_datetime).toISOString().slice(11, 16);
        pickupMap.set(p.booking_id, t);
      }
    });
  }

  const lines: string[] = [`Good morning. Daily briefing for ${today}.`, ""];

  // Arrivals
  const arr = arrRes.data ?? [];
  if (arr.length === 0) {
    lines.push("Arrivals: none today.");
  } else {
    lines.push(`Arrivals (${arr.length}):`);
    arr.forEach((b: any) => {
      const pickup = pickupMap.get(b.id);
      const time = pickup ? ` at ${pickup}` : "";
      lines.push(`- ${b.profiles?.full_name ?? "Guest"} → ${b.units?.name ?? "Unit"} (${b.num_guests}p)${time}`);
    });
  }
  lines.push("");

  // Departures
  const dep = depRes.data ?? [];
  if (dep.length === 0) {
    lines.push("Departures: none today.");
  } else {
    lines.push(`Departures (${dep.length}):`);
    dep.forEach((b: any) => {
      lines.push(`- ${b.profiles?.full_name ?? "Guest"} ← ${b.units?.name ?? "Unit"}`);
    });
  }
  lines.push("");

  // Occupancy
  const occ = occRes.count ?? 0;
  const total = unitsRes.count ?? 0;
  const pct = total > 0 ? Math.round((occ / total) * 100) : 0;
  lines.push(`Occupancy: ${occ}/${total} units (${pct}%).`);

  // Issues
  const issues: string[] = [];
  if ((pendApr.count ?? 0) > 0) issues.push(`${pendApr.count} pending approval`);
  if ((pendDep.count ?? 0) > 0) issues.push(`${pendDep.count} unpaid deposit`);
  if ((openMaint.count ?? 0) > 0) issues.push(`${openMaint.count} open maintenance`);
  lines.push(issues.length ? `Flags: ${issues.join(", ")}.` : "Flags: none.");

  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const summary = await buildBriefing(admin);

    // Dispatch via the unified pipeline — per-user prefs filter recipients
    const resp = await fetch(`${supabaseUrl}/functions/v1/notify-via-messaging`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "daily_briefing",
        metadata: { summary, detail: summary },
      }),
    });

    const dispatchResult = resp.ok ? await resp.json() : { error: await resp.text() };

    return new Response(JSON.stringify({ ok: true, summary, dispatch: dispatchResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("daily-briefing error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
