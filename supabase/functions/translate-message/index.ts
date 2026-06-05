import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAiGuard, logAiUsage, hashIp, resolveRoleAndProperty } from "../_shared/aiGuard.ts";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
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

const LANG_NAMES: Record<string, string> = {
  en: "English", th: "Thai", de: "German", fr: "French", ru: "Russian",
  zh: "Chinese", ja: "Japanese", ko: "Korean", es: "Spanish",
};

const MODEL = "google/gemini-2.5-flash";
const FN = "translate-message";
const MAX_CHARS = 4000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const t0 = Date.now();
  const ipHash = await hashIp(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { role, propertyId } = await resolveRoleAndProperty(adminClient, user.id);

    // ── AI Guard: kill-switch + per-user/property quotas ────────────────
    const decision = await checkAiGuard({
      functionName: FN, actorId: user.id, actorRole: role, propertyId, channel: "web", ipHash,
    });
    if (!decision.allow) {
      return new Response(JSON.stringify({ error: decision.reason }), {
        status: decision.status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { text, target_language } = await req.json();
    if (!text || !target_language) {
      return new Response(JSON.stringify({ error: "Missing text or target_language" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Enforce length cap to prevent token bombs
    if (typeof text !== "string" || text.length > MAX_CHARS) {
      await logAiUsage({
        functionName: FN, actorId: user.id, actorRole: role, propertyId,
        status: "blocked", errorCode: "text_too_long", ipHash,
      });
      return new Response(JSON.stringify({ error: `Text exceeds ${MAX_CHARS} characters.` }), {
        status: 413, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const targetLangName = LANG_NAMES[target_language] || target_language;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: `Translate the following text to ${targetLangName}. Respond with ONLY the translated text, nothing else.` },
          { role: "user", content: text },
        ],
      }),
    });

    if (!response.ok) {
      const code = response.status === 429 ? "upstream_rate_limit" : response.status === 402 ? "credits_exhausted" : `upstream_${response.status}`;
      await logAiUsage({
        functionName: FN, actorId: user.id, actorRole: role, propertyId,
        status: "provider_error", model: MODEL, errorCode: code, latencyMs: Date.now() - t0, ipHash,
      });
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Translation error:", response.status, t);
      return new Response(JSON.stringify({ error: "Translation failed", detail: t }), {
        status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    const usage = result.usage ?? {};

    await logAiUsage({
      functionName: FN, actorId: user.id, actorRole: role, propertyId,
      status: "ok", model: MODEL,
      tokensIn: usage.prompt_tokens ?? 0,
      tokensOut: usage.completion_tokens ?? 0,
      latencyMs: Date.now() - t0, ipHash,
    });

    if (content) {
      return new Response(
        JSON.stringify({ translated_text: content.trim(), source_language: "auto" }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "No translation returned" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate-message error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
