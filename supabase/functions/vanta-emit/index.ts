// Tiny wrapper: trusted callers (other edge functions) post here with an
// event_type + payload; we forward to vanta-dispatch. Best-effort, never blocks.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const INTERNAL_TOKEN = Deno.env.get("VANTA_INTERNAL_TOKEN") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    if (!body.internal_token || body.internal_token !== INTERNAL_TOKEN) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/vanta-dispatch`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        event_type: body.event_type,
        payload: body.payload ?? {},
        idempotency_key: body.idempotency_key,
        internal_token: INTERNAL_TOKEN,
      }),
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "emit_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
