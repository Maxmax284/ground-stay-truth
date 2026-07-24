// Ops Control Tower — AI narrative summary.
// Reads deterministic health + exceptions RPCs as the signed-in admin,
// then produces one short paragraph describing what's actually broken.
// Falls back gracefully when Lovable AI is unavailable — the tower does not
// depend on this endpoint for correctness.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "missing bearer token" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // RPCs enforce admin-only; they will throw for anyone else.
    const [{ data: health, error: hErr }, { data: exceptions, error: eErr }] =
      await Promise.all([
        supabase.rpc("get_ops_service_health"),
        supabase.rpc("get_ops_exceptions"),
      ]);
    if (hErr) return json({ error: hErr.message }, 403);
    if (eErr) return json({ error: eErr.message }, 403);

    const broken = (health ?? []).filter((h: any) =>
      h.status === "broken" || h.status === "warning",
    );
    const highExc = (exceptions ?? []).filter((e: any) => e.severity === "high");
    const medExc = (exceptions ?? []).filter((e: any) => e.severity === "medium");

    // Deterministic fallback — always accurate even if the LLM is unavailable.
    const fallback = buildFallback(broken, highExc, medExc);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return json({ summary: fallback, source: "deterministic" });
    }

    const compact = {
      degraded_systems: broken.map((h: any) => ({
        key: h.key,
        label: h.label,
        status: h.status,
        last_error: h.last_error ?? null,
      })),
      exceptions_high: highExc.map((e: any) => ({
        key: e.exception_key,
        what: e.what_failed,
        why: e.why_matters,
      })),
      exceptions_medium_count: medExc.length,
    };

    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "You are the GroundStay Ops Control Tower narrator. In ONE plain paragraph (max 60 words), tell the admin what is actually broken right now and what to look at first. If nothing is broken, say so. No emojis. No greetings. No lists. No fabrication — only speak about items present in the JSON.",
            },
            { role: "user", content: JSON.stringify(compact) },
          ],
        }),
      });
      if (!resp.ok) {
        return json({ summary: fallback, source: "deterministic", ai_status: resp.status });
      }
      const body = await resp.json();
      const summary = body?.choices?.[0]?.message?.content?.trim();
      return json({ summary: summary || fallback, source: summary ? "ai" : "deterministic" });
    } catch (err) {
      return json({ summary: fallback, source: "deterministic", ai_error: String(err) });
    }
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function buildFallback(broken: any[], highExc: any[], medExc: any[]): string {
  if (broken.length === 0 && highExc.length === 0 && medExc.length === 0) {
    return "All monitored systems report healthy and no exceptions detected.";
  }
  const parts: string[] = [];
  if (broken.length > 0) {
    parts.push(
      `${broken.length} system${broken.length === 1 ? "" : "s"} degraded (${broken.slice(0, 3).map((b: any) => b.label).join(", ")}).`,
    );
  }
  if (highExc.length > 0) {
    parts.push(`${highExc.length} high-severity exception${highExc.length === 1 ? "" : "s"} needs attention.`);
  }
  if (medExc.length > 0) {
    parts.push(`${medExc.length} medium-severity item${medExc.length === 1 ? "" : "s"} pending review.`);
  }
  return parts.join(" ");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
