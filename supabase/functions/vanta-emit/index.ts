// Tiny wrapper: trusted callers (other edge functions) post here with an
// event_type + payload; we forward to vanta-dispatch. Best-effort, never blocks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const INTERNAL_TOKEN = Deno.env.get("VANTA_INTERNAL_TOKEN") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function isTrustedInternalToken(token: unknown): Promise<boolean> {
  if (typeof token !== "string" || token.length < 8) return false;
  if (INTERNAL_TOKEN && token === INTERNAL_TOKEN) return true;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return false;

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data } = await supabase.rpc("get_integration_secret", { _key: "vanta_internal_token" });
    return typeof data === "string" && data.length >= 8 && token === data;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    if (!(await isTrustedInternalToken(body.internal_token))) {
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
