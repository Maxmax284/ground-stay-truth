// weekly-friction-digest — Monday-morning pattern email for admins/managers.
// Read-only: counts last week vs the week before and sends one admin alert.
// Triggered by pg_cron (Mondays 01:00 UTC = 08:00 Bangkok) with an internal token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emitAdminAlert } from "../_shared/adminAlert.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const body = await req.json().catch(() => ({}));
  if (!body?.internal_token || body.internal_token !== Deno.env.get("ADMIN_ALERT_INTERNAL_TOKEN")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  }
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await admin.rpc("get_friction_radar_weekly", { _weeks: 3 });
    if (error) throw error;
    // Row 0 is the current (just-started) week; digest covers the last full week.
    const last = data?.[1], before = data?.[2];
    if (!last) throw new Error("no weekly data");
    const d = (a: number, b?: number) => (b === undefined ? "" : ` (${a - b >= 0 ? "+" : ""}${a - b} vs week before)`);
    const idFail = (w: any) => Math.max(w.id_upload_started - w.id_upload_success, 0) + w.id_docs_rejected;
    const msg = [
      `Weekly Friction Radar — week of ${last.week_start}.`,
      `Guests who couldn't see their booking: ${last.booking_missing_guests}${d(last.booking_missing_guests, before?.booking_missing_guests)}.`,
      `ID upload friction: ${idFail(last)}${before ? d(idFail(last), idFail(before)) : ""} — ${last.id_upload_started} started, ${last.id_upload_success} finished, ${last.id_docs_rejected} rejected.`,
      `Emails not delivered: ${last.emails_failed} of ${last.emails_sent + last.emails_failed}${d(last.emails_failed, before?.emails_failed)}.`,
      `Full view: Ops Control Tower → Friction Radar.`,
    ].join(" ");
    await emitAdminAlert("weekly_friction_radar", msg, {
      deepLink: "/ops-control-tower?tab=radar",
      context: { week_start: last.week_start },
    });
    return new Response(JSON.stringify({ ok: true, message: msg }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("weekly-friction-digest failed", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), { status: 500, headers: cors });
  }
});
