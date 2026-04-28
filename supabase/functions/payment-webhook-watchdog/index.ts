// Re-process unprocessed payment_events. Designed to run hourly via pg_cron.
// Calls the payment-webhook function internally with stored payloads.
// Caps retries at 10 and dead-letters older entries.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_RETRIES = 10;
const BATCH = 25;

serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: stuck, error } = await admin
    .from("payment_events")
    .select("id, provider, provider_event_id, event_type, payload, retry_count")
    .eq("processed", false)
    .lt("retry_count", MAX_RETRIES)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    console.error("[watchdog] query failed", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const results: any[] = [];
  for (const ev of stuck ?? []) {
    try {
      // Re-invoke the webhook handler with the stored payload.
      // The webhook is idempotent on provider_event_id so this is safe.
      const resp = await fetch(`${supabaseUrl}/functions/v1/payment-webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-watchdog-replay": "1",
          "x-replay-event-id": ev.provider_event_id,
          "x-replay-provider": ev.provider,
        },
        body: JSON.stringify(ev.payload),
      });
      const ok = resp.ok;
      results.push({ id: ev.id, status: resp.status, ok });
      if (!ok) {
        const txt = await resp.text().catch(() => "");
        await admin.rpc("increment_payment_event_retry", {
          _provider_event_id: ev.provider_event_id,
          _error: `replay_${resp.status}: ${txt.slice(0, 240)}`,
        });
      }
    } catch (e: any) {
      results.push({ id: ev.id, error: e?.message });
      await admin.rpc("increment_payment_event_retry", {
        _provider_event_id: ev.provider_event_id,
        _error: e?.message?.slice(0, 240) ?? "unknown",
      });
    }
  }

  // Log dead-letter count for visibility
  const { count: dead } = await admin
    .from("payment_events")
    .select("id", { count: "exact", head: true })
    .eq("processed", false)
    .gte("retry_count", MAX_RETRIES);

  return new Response(
    JSON.stringify({ processed_attempts: results.length, dead_letter_count: dead ?? 0, results }),
    { headers: { "Content-Type": "application/json" } },
  );
});
