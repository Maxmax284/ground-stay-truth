// Universal AI Governance middleware.
// Enforces kill switches, per-user/property quotas, and logs every call into
// ai_usage_events. Use checkAiGuard() before invoking the model, then
// logAiUsage() after the call to record tokens/cost/latency.
//
// All limits live in policy_settings so admins can tune without redeploy.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type Role = "guest" | "front_desk" | "front_desk_supervisor" | "manager" | "admin" | string;

export interface GuardInput {
  functionName: string;        // 'translate-message' | 'verify-document' | 'ai-assistant' | ...
  mode?: string | null;
  actorId: string | null;      // null for cron/webhook
  actorRole?: Role | null;
  propertyId?: string | null;
  channel?: string | null;     // 'web' | 'whatsapp' | 'telegram' | 'line' | 'cron'
  ipHash?: string | null;
  requestHash?: string | null;
  bypassQuota?: boolean;       // cron / internal callers
}

export interface GuardDecision {
  allow: boolean;
  reason?: string;
  status: number;              // HTTP status to return when !allow
}

// Map function name → feature kill-switch policy key
const FEATURE_KEY: Record<string, string> = {
  "ai-assistant":          "ai_assistant_enabled",
  "translate-message":     "ai_translate_enabled",
  "verify-document":       "ai_verify_document_enabled",
  "draft-arrival-welcome": "ai_drafts_enabled",
  "messaging-router":      "ai_messaging_enabled",
  "corner-talk":           "ai_assistant_enabled",
  "daily-briefing":        "ai_assistant_enabled",
  "fraud-detection":       "ai_assistant_enabled",
  "guest-arrival-journey": "ai_assistant_enabled",
};

// Map function name → daily quota policy key per role tier
function dailyKeyFor(functionName: string, role: Role | null | undefined): string | null {
  const r = (role || "guest").toLowerCase();
  if (functionName === "translate-message") {
    if (r === "guest") return "ai_translate_daily_limit_guest";
    if (r === "admin") return null;
    return "ai_translate_daily_limit_staff";
  }
  if (functionName === "verify-document") {
    if (r === "guest") return "ai_verify_doc_daily_limit_guest";
    if (r === "admin") return null;
    return "ai_verify_doc_daily_limit_staff";
  }
  // generic catch-all (ai-assistant, drafts, etc.)
  if (r === "guest") return "ai_user_daily_limit_guest";
  if (r === "manager") return "ai_user_daily_limit_manager";
  if (r === "admin") return null;
  return "ai_user_daily_limit_staff";
}

function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function readPolicy(client: SupabaseClient, key: string): Promise<string | null> {
  const { data } = await client
    .from("policy_settings")
    .select("value")
    .eq("key", key)
    .is("property_id", null)
    .maybeSingle();
  if (!data) return null;
  const v = data.value;
  return typeof v === "string" ? v : JSON.stringify(v);
}

function asInt(v: string | null, fallback: number): number {
  if (!v) return fallback;
  const n = parseInt(String(v).replace(/"/g, ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function asBool(v: string | null, fallback: boolean): boolean {
  if (v === null) return fallback;
  const s = String(v).replace(/"/g, "").toLowerCase();
  return s === "true" || s === "1";
}

export async function checkAiGuard(input: GuardInput): Promise<GuardDecision> {
  const sb = admin();

  // 1. Global kill switch
  const globalOn = asBool(await readPolicy(sb, "ai_assistant_enabled"), true);
  if (!globalOn) {
    await logBlocked(sb, input, "global_disabled");
    return { allow: false, reason: "AI is disabled by an administrator.", status: 403 };
  }

  // 2. Per-feature kill switch
  const featureKey = FEATURE_KEY[input.functionName];
  if (featureKey && featureKey !== "ai_assistant_enabled") {
    const featureOn = asBool(await readPolicy(sb, featureKey), true);
    if (!featureOn) {
      await logBlocked(sb, input, "feature_disabled");
      return { allow: false, reason: "This AI feature is disabled.", status: 403 };
    }
  }

  if (input.bypassQuota) return { allow: true, status: 200 };

  // 3. Per-user daily cap
  if (input.actorId) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const dKey = dailyKeyFor(input.functionName, input.actorRole);
    if (dKey) {
      const limit = asInt(await readPolicy(sb, dKey), 0);
      if (limit > 0) {
        const { count } = await sb
          .from("ai_usage_events")
          .select("id", { count: "exact", head: true })
          .eq("function_name", input.functionName)
          .eq("actor_id", input.actorId)
          .eq("status", "ok")
          .gte("created_at", dayAgo);
        if ((count ?? 0) >= limit) {
          await logBlocked(sb, input, "user_daily_limit");
          return {
            allow: false,
            reason: `Daily AI limit reached (${limit}). Try again tomorrow.`,
            status: 429,
          };
        }
      }
    }
  }

  // 4. Per-property daily cap
  if (input.propertyId) {
    const limit = asInt(await readPolicy(sb, "ai_property_daily_limit"), 0);
    if (limit > 0) {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await sb
        .from("ai_usage_events")
        .select("id", { count: "exact", head: true })
        .eq("property_id", input.propertyId)
        .eq("status", "ok")
        .gte("created_at", dayAgo);
      if ((count ?? 0) >= limit) {
        await logBlocked(sb, input, "property_daily_limit");
        return {
          allow: false,
          reason: "This property has reached its daily AI quota.",
          status: 429,
        };
      }
    }
  }

  // 5. Manual pause window (admin "pause AI" button)
  const pauseUntil = await readPolicy(sb, "ai_pause_until");
  if (pauseUntil && pauseUntil.replace(/"/g, "")) {
    const until = new Date(pauseUntil.replace(/"/g, ""));
    if (!isNaN(until.getTime()) && until.getTime() > Date.now()) {
      await logBlocked(sb, input, "manually_paused");
      return { allow: false, reason: "AI is temporarily paused by an administrator.", status: 503 };
    }
  }

  // 6. IP-hash velocity guard (anti-abuse)
  if (input.ipHash) {
    const ipLimit = asInt(await readPolicy(sb, "ai_ip_hourly_limit"), 100);
    if (ipLimit > 0) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await sb
        .from("ai_usage_events")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", input.ipHash)
        .gte("created_at", hourAgo);
      if ((count ?? 0) >= ipLimit) {
        await logBlocked(sb, input, "ip_velocity");
        try {
          await sb.from("security_events").insert({
            event_type: "ai_ip_velocity_block",
            severity: "warning",
            context: { ip_hash: input.ipHash, function_name: input.functionName, count },
          });
        } catch (_) { /* noop */ }
        return { allow: false, reason: "Too many requests from your network. Try again later.", status: 429 };
      }
    }
  }

  // 7. Request dedup (same actor + function + payload hash within window)
  if (input.actorId && (input as any).requestHash) {
    const win = asInt(await readPolicy(sb, "ai_dedup_window_seconds"), 60);
    if (win > 0) {
      const since = new Date(Date.now() - win * 1000).toISOString();
      const { data } = await sb
        .from("ai_usage_events")
        .select("id")
        .eq("actor_id", input.actorId)
        .eq("function_name", input.functionName)
        .eq("request_hash", (input as any).requestHash)
        .gte("created_at", since)
        .limit(1)
        .maybeSingle();
      if (data) {
        await logBlocked(sb, input, "duplicate_request");
        return { allow: false, reason: "Duplicate request detected. Please wait a moment.", status: 429 };
      }
    }
  }

  return { allow: true, status: 200 };
}

export interface LogInput extends GuardInput {
  status: "ok" | "provider_error" | "blocked" | "rate_limited";
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
  requestHash?: string | null;
  errorCode?: string | null;
}

export async function logAiUsage(input: LogInput): Promise<void> {
  try {
    const sb = admin();
    const cost = await estimateCostMicroUsd(sb, input.model, input.tokensIn ?? 0, input.tokensOut ?? 0);
    await sb.from("ai_usage_events").insert({
      function_name: input.functionName,
      mode: input.mode ?? null,
      actor_id: input.actorId,
      actor_role: input.actorRole ?? null,
      property_id: input.propertyId ?? null,
      channel: input.channel ?? null,
      status: input.status,
      model: input.model ?? null,
      tokens_in: input.tokensIn ?? 0,
      tokens_out: input.tokensOut ?? 0,
      latency_ms: input.latencyMs ?? null,
      cost_estimate_micro_usd: cost,
      request_hash: input.requestHash ?? null,
      ip_hash: input.ipHash ?? null,
      error_code: input.errorCode ?? null,
    });
  } catch (e) {
    console.error("[aiGuard] log failed", e);
  }
}

async function logBlocked(sb: SupabaseClient, input: GuardInput, reason: string) {
  try {
    await sb.from("ai_usage_events").insert({
      function_name: input.functionName,
      mode: input.mode ?? null,
      actor_id: input.actorId,
      actor_role: input.actorRole ?? null,
      property_id: input.propertyId ?? null,
      channel: input.channel ?? null,
      status: "blocked",
      ip_hash: input.ipHash ?? null,
      error_code: reason,
    });
  } catch (e) {
    console.error("[aiGuard] block-log failed", e);
  }
}

async function estimateCostMicroUsd(
  sb: SupabaseClient,
  model: string | undefined,
  tokensIn: number,
  tokensOut: number,
): Promise<number> {
  if (!model) return 0;
  const { data } = await sb
    .from("ai_model_costs")
    .select("input_micro_usd_per_1k, output_micro_usd_per_1k")
    .eq("model", model)
    .maybeSingle();
  if (!data) return 0;
  return Math.round(
    (tokensIn * Number(data.input_micro_usd_per_1k) +
      tokensOut * Number(data.output_micro_usd_per_1k)) / 1000,
  );
}

export async function hashIp(req: Request): Promise<string | null> {
  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;
  if (!ip) return null;
  const enc = new TextEncoder().encode(ip + (Deno.env.get("SUPABASE_JWKS") ?? "salt"));
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function resolveRoleAndProperty(
  sb: SupabaseClient,
  userId: string | null,
): Promise<{ role: Role | null; propertyId: string | null }> {
  if (!userId) return { role: null, propertyId: null };
  const [{ data: roleRow }, { data: propRow }] = await Promise.all([
    sb.from("user_roles").select("role").eq("user_id", userId).limit(1).maybeSingle(),
    sb.from("user_property_assignments").select("property_id").eq("user_id", userId).limit(1).maybeSingle(),
  ]);
  return { role: (roleRow?.role as Role) ?? "guest", propertyId: propRow?.property_id ?? null };
}
