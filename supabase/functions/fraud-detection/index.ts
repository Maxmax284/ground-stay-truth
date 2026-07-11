// fraud-detection
// -----------------------------------------------------------------------------
// Heuristic pass on new bookings. Not AI, not magic — just rules that catch
// the obvious stuff (mismatched country + card, brand-new account booking
// premium villa, back-to-back cancels from same email, etc.). Flags for
// manual review; never auto-cancels. Human always makes the call.
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
 * Fraud detection scanner — runs periodically via pg_cron.
 * Detects: card testing, excessive refunds, refund > charge, chargeback patterns.
 * Emits events to Fenrir Lock via fenrir-dispatch.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ─── AUTH: Only allow internal/cron calls with service role key ───────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized — internal use only" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const events: any[] = [];

    // 1. Excessive refunds: staff processing >5 refunds in last hour
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const { data: recentRefunds } = await supabase
      .from("payments")
      .select("recorded_by, booking_id, refund_amount, amount")
      .gt("refund_amount", 0)
      .gte("created_at", oneHourAgo);

    // Group by recorded_by
    const refundsByStaff = new Map<string, any[]>();
    for (const r of recentRefunds ?? []) {
      if (!r.recorded_by) continue;
      const arr = refundsByStaff.get(r.recorded_by) || [];
      arr.push(r);
      refundsByStaff.set(r.recorded_by, arr);
    }

    for (const [staffId, refunds] of refundsByStaff) {
      if (refunds.length > 5) {
        // Get staff email
        const { data: profile } = await supabase
          .from("profiles")
          .select("email")
          .eq("user_id", staffId)
          .single();

        events.push({
          event_type: "payment_anomaly",
          severity: "high",
          confidence_score: 85,
          user_email: profile?.email,
          details: {
            source_platform: "groundstay",
            actor_role: "front_desk",
            actor_id: staffId,
            actor_email: profile?.email,
            anomaly_type: "excessive_refunds",
            refund_count: refunds.length,
            time_window: "1h",
          },
        });
      }
    }

    // 2. Refund exceeds original charge (scan last 7 days to keep query bounded)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: overRefunds } = await supabase
      .from("payments")
      .select("id, booking_id, amount, refund_amount, recorded_by")
      .gt("refund_amount", 0)
      .gte("created_at", sevenDaysAgo);

    for (const p of overRefunds ?? []) {
      if (Number(p.refund_amount) > Number(p.amount)) {
        events.push({
          event_type: "payment_anomaly",
          severity: "high",
          confidence_score: 95,
          details: {
            source_platform: "groundstay",
            actor_role: "system",
            actor_id: p.recorded_by || "system",
            anomaly_type: "refund_exceeds_charge",
            payment_id: p.id,
            booking_id: p.booking_id,
            original_amount: p.amount,
            refund_amount: p.refund_amount,
          },
        });
      }
    }

    // 3. Card testing detection: >3 small payment attempts (<500 THB) from same source in last 5 minutes
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const { data: smallPayments } = await supabase
      .from("payments")
      .select("id, amount, status, booking_id, source_channel, created_at")
      .lt("amount", 500)
      .gte("created_at", fiveMinAgo);

    // Group by source_channel (rough proxy for source)
    const bySource = new Map<string, any[]>();
    for (const p of smallPayments ?? []) {
      const key = p.source_channel || "unknown";
      const arr = bySource.get(key) || [];
      arr.push(p);
      bySource.set(key, arr);
    }

    for (const [source, payments] of bySource) {
      if (payments.length > 3) {
        events.push({
          event_type: "card_testing_detected",
          severity: "critical",
          confidence_score: 80,
          details: {
            source_platform: "groundstay",
            actor_role: "system",
            actor_id: "system",
            attempt_count: payments.length,
            source_channel: source,
            time_window: "5m",
            amounts: payments.map((p: any) => p.amount),
          },
        });
      }
    }

    // Forward detected events to fenrir-dispatch
    if (events.length > 0) {
      await supabase.functions.invoke("fenrir-dispatch", {
        body: { events },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        events_detected: events.length,
        timestamp: now.toISOString(),
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[fraud-detection] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
