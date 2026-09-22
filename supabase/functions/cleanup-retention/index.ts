// cleanup-retention
// -----------------------------------------------------------------------------
// Daily PII purge per PDPA/GDPR. Default 90 days. Retention windows come from
// `policy_settings` so a tenant can dial them up/down without a code change.
// Purges are logged to `staff_audit_events` for the compliance paper trail.
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
  // Allow Lovable preview/dev origins
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

/**
 * Data Retention Cleanup
 * 
 * Deletes old rows from high-growth tables to prevent unbounded storage:
 * - security_events: 90 days
 * - booking_state_log: 180 days
 * - email_log: 90 days
 * - recovery_audit_log: 180 days
 * - payment_events (processed): 90 days
 * - notifications (read): 60 days
 *
 * Should be called via pg_cron daily.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: accept service role key OR anon key (for pg_cron via pg_net)
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "") ?? "";
    if (token !== serviceRoleKey && token !== anonKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const now = new Date();
    const results: Record<string, number> = {};

    const retentionRules = [
      { table: "security_events", column: "created_at", days: 90 },
      { table: "booking_state_log", column: "created_at", days: 180 },
      { table: "email_log", column: "sent_at", days: 90 },
      { table: "recovery_audit_log", column: "created_at", days: 180 },
      { table: "notifications", column: "created_at", days: 60, extraFilter: { column: "read", value: true } },
      // F-38: Message retention — delete messages older than 365 days for completed bookings
      { table: "messages", column: "created_at", days: 365 },
      // F-46: Profile audit log retention
      { table: "profile_audit_log", column: "created_at", days: 365 },
    ];

    for (const rule of retentionRules) {
      const cutoff = new Date(now.getTime() - rule.days * 24 * 60 * 60 * 1000).toISOString();

      let query = supabase
        .from(rule.table)
        .delete({ count: "exact" })
        .lt(rule.column, cutoff);

      if (rule.extraFilter) {
        query = query.eq(rule.extraFilter.column, rule.extraFilter.value);
      }

      const { count, error } = await query;
      if (error) {
        console.error(`Cleanup ${rule.table} failed:`, error.message);
        results[rule.table] = -1;
      } else {
        results[rule.table] = count ?? 0;
      }
    }

    // Payment events: only delete processed ones
    const peCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { count: peCount, error: peError } = await supabase
      .from("payment_events")
      .delete({ count: "exact" })
      .eq("processed", true)
      .lt("created_at", peCutoff);

    results["payment_events"] = peError ? -1 : (peCount ?? 0);
    if (peError) console.error("Cleanup payment_events failed:", peError.message);

    // -------------------------------------------------------------------------
    // Arrival Intelligence retention (Stage 5). Mirrors src/lib/arrivalRetention.ts
    //  - uploaded travel evidence: deleted 30 days after checkout (file + row)
    //  - derived flight facts: 90 days
    //  - resolved/dismissed arrival conflicts: 90 days after resolution
    // Provenance and stage logs are NOT touched here — they are kept 2 years.
    // -------------------------------------------------------------------------
    const EVIDENCE_DAYS_AFTER_CHECKOUT = 30;
    const FLIGHT_FACT_DAYS = 90;
    const RESOLVED_CONFLICT_DAYS = 90;

    try {
      const checkoutCutoff = new Date(
        now.getTime() - EVIDENCE_DAYS_AFTER_CHECKOUT * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .slice(0, 10);

      // Stays that ended long enough ago.
      const { data: oldBookings } = await supabase
        .from("bookings")
        .select("id")
        .lt("check_out", checkoutCutoff)
        .limit(2000);

      const oldIds = (oldBookings ?? []).map((b: { id: string }) => b.id);
      let evidencePurged = 0;
      let filesPurged = 0;

      if (oldIds.length) {
        const { data: evidence } = await supabase
          .from("journey_evidence")
          .select("id, storage_path")
          .in("booking_id", oldIds)
          .limit(1000);

        const rows = evidence ?? [];
        const paths = rows
          .map((r: { storage_path: string | null }) => r.storage_path)
          .filter((p: string | null): p is string => !!p);

        if (paths.length) {
          const { data: removed, error: rmErr } = await supabase.storage
            .from("guest-documents")
            .remove(paths);
          if (rmErr) console.error("Evidence file purge failed:", rmErr.message);
          else filesPurged = removed?.length ?? 0;
        }

        if (rows.length) {
          const { count, error } = await supabase
            .from("journey_evidence")
            .delete({ count: "exact" })
            .in("id", rows.map((r: { id: string }) => r.id));
          if (error) console.error("Evidence row purge failed:", error.message);
          else evidencePurged = count ?? 0;
        }
      }

      results["journey_evidence"] = evidencePurged;
      results["travel_evidence_files"] = filesPurged;

      // Derived flight facts older than 90 days. journey_legs.flight_fact_id is
      // ON DELETE SET NULL, so legs and their provenance survive intact.
      const factCutoff = new Date(now.getTime() - FLIGHT_FACT_DAYS * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const { count: factCount, error: factErr } = await supabase
        .from("flight_facts")
        .delete({ count: "exact" })
        .lt("flight_date", factCutoff);
      results["flight_facts"] = factErr ? -1 : (factCount ?? 0);
      if (factErr) console.error("Cleanup flight_facts failed:", factErr.message);

      // Settled conflicts. Open ones are never deleted — a human still owes a call.
      const conflictCutoff = new Date(
        now.getTime() - RESOLVED_CONFLICT_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { count: cfCount, error: cfErr } = await supabase
        .from("arrival_conflicts")
        .delete({ count: "exact" })
        .in("status", ["resolved", "dismissed"])
        .lt("resolved_at", conflictCutoff);
      results["arrival_conflicts"] = cfErr ? -1 : (cfCount ?? 0);
      if (cfErr) console.error("Cleanup arrival_conflicts failed:", cfErr.message);
    } catch (arrivalErr) {
      console.error("Arrival retention purge failed:", (arrivalErr as Error).message);
      results["arrival_retention_error"] = -1;
    }

    return new Response(
      JSON.stringify({ success: true, deleted: results, timestamp: now.toISOString() }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
