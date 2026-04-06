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
    return new Response(null, { headers: corsHeaders });
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    return new Response(
      JSON.stringify({ success: true, deleted: results, timestamp: now.toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
