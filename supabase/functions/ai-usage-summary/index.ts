// Admin-only AI usage aggregations for the Security Center dashboard.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(req);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return jsonResponse(req, { error: "unauthorized" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const userRes = await sb.auth.getUser(auth.replace("Bearer ", ""));
    const user = userRes.data.user;
    if (!user) return jsonResponse(req, { error: "unauthorized" }, 401);

    const { data: roleRow } = await sb
      .from("user_roles").select("role").eq("user_id", user.id).limit(1).maybeSingle();
    if (roleRow?.role !== "admin") return jsonResponse(req, { error: "forbidden" }, 403);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const last30 = new Date(now.getTime() - 30 * 86400_000).toISOString();
    const last24 = new Date(now.getTime() - 86400_000).toISOString();

    const [mtd, daily, byFn, denials, byUser, byProperty] = await Promise.all([
      sb.from("ai_usage_events")
        .select("cost_estimate_micro_usd, tokens_in, tokens_out")
        .gte("created_at", monthStart),
      sb.from("ai_usage_events")
        .select("created_at, cost_estimate_micro_usd, status")
        .gte("created_at", last30),
      sb.from("ai_usage_events")
        .select("function_name, status, cost_estimate_micro_usd")
        .gte("created_at", monthStart),
      sb.from("ai_usage_events")
        .select("id, created_at, function_name, actor_id, actor_role, status, error_code, ip_hash")
        .neq("status", "ok")
        .gte("created_at", last24)
        .order("created_at", { ascending: false })
        .limit(50),
      sb.from("ai_usage_events")
        .select("actor_id, actor_role, cost_estimate_micro_usd")
        .gte("created_at", monthStart)
        .not("actor_id", "is", null),
      sb.from("ai_usage_events")
        .select("property_id, cost_estimate_micro_usd")
        .gte("created_at", monthStart)
        .not("property_id", "is", null),
    ]);

    const totalCost = (mtd.data ?? []).reduce((s, r: any) => s + (r.cost_estimate_micro_usd ?? 0), 0);
    const totalCalls = (mtd.data ?? []).length;
    const totalTokensIn = (mtd.data ?? []).reduce((s, r: any) => s + (r.tokens_in ?? 0), 0);
    const totalTokensOut = (mtd.data ?? []).reduce((s, r: any) => s + (r.tokens_out ?? 0), 0);

    // sparkline by day
    const days: Record<string, { calls: number; cost: number; blocked: number }> = {};
    for (const r of (daily.data ?? []) as any[]) {
      const d = (r.created_at as string).slice(0, 10);
      days[d] ||= { calls: 0, cost: 0, blocked: 0 };
      days[d].calls += 1;
      days[d].cost += r.cost_estimate_micro_usd ?? 0;
      if (r.status !== "ok") days[d].blocked += 1;
    }

    const byFunction: Record<string, { calls: number; blocked: number; cost: number }> = {};
    for (const r of (byFn.data ?? []) as any[]) {
      byFunction[r.function_name] ||= { calls: 0, blocked: 0, cost: 0 };
      byFunction[r.function_name].calls += 1;
      byFunction[r.function_name].cost += r.cost_estimate_micro_usd ?? 0;
      if (r.status !== "ok") byFunction[r.function_name].blocked += 1;
    }

    const userAgg: Record<string, { actorRole: string | null; calls: number; cost: number }> = {};
    for (const r of (byUser.data ?? []) as any[]) {
      userAgg[r.actor_id] ||= { actorRole: r.actor_role, calls: 0, cost: 0 };
      userAgg[r.actor_id].calls += 1;
      userAgg[r.actor_id].cost += r.cost_estimate_micro_usd ?? 0;
    }
    const topUsers = Object.entries(userAgg)
      .sort((a, b) => b[1].cost - a[1].cost)
      .slice(0, 10)
      .map(([actor_id, v]) => ({ actor_id, ...v }));

    const propertyAgg: Record<string, { calls: number; cost: number }> = {};
    for (const r of (byProperty.data ?? []) as any[]) {
      propertyAgg[r.property_id] ||= { calls: 0, cost: 0 };
      propertyAgg[r.property_id].calls += 1;
      propertyAgg[r.property_id].cost += r.cost_estimate_micro_usd ?? 0;
    }

    // Pull budget
    const { data: budgetRow } = await sb
      .from("policy_settings").select("value").eq("key", "ai_monthly_budget_micro_usd").is("property_id", null).maybeSingle();
    const monthlyBudget = budgetRow ? parseInt(String(budgetRow.value).replace(/"/g, ""), 10) || 0 : 0;

    return jsonResponse(req, {
      mtd: { totalCalls, totalCost, totalTokensIn, totalTokensOut, monthlyBudget },
      daily: Object.entries(days).sort().map(([day, v]) => ({ day, ...v })),
      byFunction,
      topUsers,
      byProperty: propertyAgg,
      recentDenials: denials.data ?? [],
    });
  } catch (e) {
    console.error("[ai-usage-summary]", e);
    return jsonResponse(req, { error: String(e) }, 500);
  }
});
