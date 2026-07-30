// Budget watchdog — runs every 15min via pg_cron.
// 1) Sums MTD AI cost
// 2) Fires security_events at 75/90/100% (dedup by month marker in policy_settings)
// 3) At 100%, auto-disables ai_assistant_enabled and writes a critical staff_audit event
// 4) Honors a manual ai_pause_until timestamp (auto-restores after pause expires)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflight, getCorsHeaders } from "../_shared/cors.ts";
import { sendFenrirSecurityEvent } from "../_shared/fenrir.ts";
import { emitAdminAlert } from "../_shared/adminAlert.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(req);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const now = new Date();
    const monthMarker = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    // Pull settings
    const keys = [
      "ai_monthly_budget_micro_usd",
      "ai_budget_alert_75_sent_month",
      "ai_budget_alert_90_sent_month",
      "ai_budget_alert_100_sent_month",
      "ai_assistant_enabled",
      "ai_pause_until",
    ];
    const { data: settings } = await sb
      .from("policy_settings").select("key, value").is("property_id", null).in("key", keys);
    const s: Record<string, string> = {};
    for (const r of settings ?? []) s[r.key] = String(r.value).replace(/"/g, "");

    const budget = parseInt(s.ai_monthly_budget_micro_usd ?? "0", 10) || 0;

    // Handle manual pause expiry
    if (s.ai_pause_until) {
      const until = new Date(s.ai_pause_until);
      if (!isNaN(until.getTime()) && until.getTime() < Date.now()) {
        await setPolicy(sb, "ai_pause_until", "");
        if (s.ai_assistant_enabled !== "true") {
          await setPolicy(sb, "ai_assistant_enabled", "true");
          await logEvent(sb, "ai_paused_auto_restored", "info", { until: s.ai_pause_until });
        }
      }
    }

    // MTD spend
    const { data: rows } = await sb
      .from("ai_usage_events")
      .select("cost_estimate_micro_usd")
      .gte("created_at", monthStart);
    const spent = (rows ?? []).reduce((a, r: any) => a + (r.cost_estimate_micro_usd ?? 0), 0);
    const pct = budget > 0 ? (spent / budget) * 100 : 0;

    const fired: string[] = [];
    if (budget > 0) {
      if (pct >= 75 && s.ai_budget_alert_75_sent_month !== monthMarker) {
        await logEvent(sb, "ai_budget_75pct", "warning", { spent, budget, pct });
        await setPolicy(sb, "ai_budget_alert_75_sent_month", monthMarker);
        fired.push("75");
      }
      if (pct >= 90 && s.ai_budget_alert_90_sent_month !== monthMarker) {
        await logEvent(sb, "ai_budget_90pct", "warning", { spent, budget, pct });
        await setPolicy(sb, "ai_budget_alert_90_sent_month", monthMarker);
        fired.push("90");
      }
      if (pct >= 100 && s.ai_budget_alert_100_sent_month !== monthMarker) {
        await logEvent(sb, "ai_budget_100pct", "critical", { spent, budget, pct });
        await setPolicy(sb, "ai_budget_alert_100_sent_month", monthMarker);
        await setPolicy(sb, "ai_assistant_enabled", "false");
        await sb.from("staff_audit_events").insert({
          event_type: "ai_budget_kill_switch_engaged",
          severity: "critical",
          metadata: { spent_micro_usd: spent, budget_micro_usd: budget, month: monthMarker },
        });
        // Fenrir Phase 3 — surface the kill switch as a system.kill_switch_activated event.
        await sendFenrirSecurityEvent(
          {
            event_type: "ai_kill_switch_engaged",
            severity: "critical",
            confidence_score: 100,
            details: {
              source_platform: "groundstay",
              actor_role: "admin",
              actor_id: "system",
              trigger: "ai_budget_100pct",
              spent_bucket: spent >= 10_000_000 ? "10M+" : String(spent),
              month: monthMarker,
            },
          },
          { supabase: sb, environment: "production" },
        );
        fired.push("100");
      }
    }

    if (fired.length > 0) {
      await emitAdminAlert(
        "ai_budget_warning",
        `AI spend has reached ${Math.round(pct)}% of this month's budget.`,
        { deepLink: "/settings", context: { percent_used: Math.round(pct), thresholds_crossed: fired.join(", "), month: monthMarker } },
      );
    }

    return json({ ok: true, spent, budget, pct, fired });
  } catch (e) {
    console.error("[ai-budget-watchdog]", e);
    return json({ error: String(e) }, 500);
  }
});

async function setPolicy(sb: any, key: string, value: string) {
  const jsonVal = JSON.stringify(value);
  await sb.from("policy_settings")
    .update({ value: jsonVal, updated_at: new Date().toISOString() })
    .eq("key", key).is("property_id", null);
}

async function logEvent(sb: any, type: string, severity: string, ctx: Record<string, unknown>) {
  try {
    await sb.from("security_events").insert({
      event_type: type, severity, context: ctx,
    });
  } catch (e) {
    console.error("[watchdog] logEvent failed", e);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}
