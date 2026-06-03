// Read-only Vanta lookup endpoint. Vanta posts a signed request asking for
// minimum-necessary human context for a known UUID. We verify the HMAC
// signature, check the integration toggle, look up the record by type+id,
// return only fields appropriate for the stated purpose, and audit the call.
//
// This endpoint NEVER mutates GTH state. No bookings, payments, messages,
// or tickets are modified. It is purely a "front desk window" for Vanta
// to fetch a guest's first name + language before drafting a reply.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_LOOKUP_TYPES = new Set([
  "booking",
  "guest",
  "unit",
  "maintenance_ticket",
  "guest_message",
  "payment_signal",
  "accommodation_file",
]);

const ALLOWED_PURPOSES = new Set([
  "dashboard_review",
  "draft_confirmation",
  "draft_guest_reply",
  "review_maintenance_ticket",
  "review_booking",
  "payment_review",
  "file_linking",
  "briefing_detail",
  "audit_detail",
]);

const MAX_TIMESTAMP_SKEW_SECONDS = 300; // 5 minutes

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function firstName(full: string | null | undefined): string {
  if (!full) return "Guest";
  return full.trim().split(/\s+/)[0] || "Guest";
}

function safeContactChannel(p: { email?: string | null; whatsapp?: string | null; line_id?: string | null; phone?: string | null }): string {
  if (p.email) return "email";
  if (p.whatsapp) return "whatsapp";
  if (p.line_id) return "line";
  if (p.phone) return "phone";
  return "none";
}

type AuditPayload = {
  request_id: string | null;
  lookup_type: string;
  lookup_id: string | null;
  purpose: string | null;
  authorized: boolean;
  signature_valid: boolean;
  response_status: string;
  fields_returned: string[];
  sensitivity_level: string | null;
  environment: string | null;
  error_summary: string | null;
};

async function writeAudit(supabase: ReturnType<typeof createClient>, audit_id: string, a: AuditPayload) {
  try {
    await supabase.from("vanta_lookup_audit").insert({
      audit_id,
      request_id: a.request_id,
      lookup_type: a.lookup_type,
      lookup_id: a.lookup_id,
      purpose: a.purpose,
      requester_source: "vanta",
      authorized: a.authorized,
      signature_valid: a.signature_valid,
      response_status: a.response_status,
      fields_returned: a.fields_returned,
      sensitivity_level: a.sensitivity_level,
      environment: a.environment,
      error_summary: a.error_summary,
    });
  } catch {
    // Audit failure must never block response.
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const audit_id = `gth_lookup_${crypto.randomUUID()}`;

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "malformed_request", message: "POST required." }, 405);
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get("x-vanta-signature") ?? "";
  const tsHeader = req.headers.get("x-vanta-timestamp") ?? "";
  const requestIdHeader = req.headers.get("x-vanta-request-id");
  const sourceHeader = (req.headers.get("x-vanta-source") ?? "").toLowerCase();

  // Parse body early so audit gets context even on early failures.
  let body: Record<string, unknown> = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    await writeAudit(supabase, audit_id, {
      request_id: requestIdHeader, lookup_type: "unknown", lookup_id: null, purpose: null,
      authorized: false, signature_valid: false, response_status: "malformed_request",
      fields_returned: [], sensitivity_level: null, environment: null,
      error_summary: "invalid_json",
    });
    return jsonResponse({ ok: false, error: "malformed_request", message: "Body must be JSON." }, 400);
  }

  const lookup_type = String(body.lookup_type ?? "");
  const lookup_id = body.lookup_id ? String(body.lookup_id) : null;
  const purpose = body.purpose ? String(body.purpose) : null;
  const request_id = (body.request_id ? String(body.request_id) : requestIdHeader) ?? null;
  const environment = body.environment ? String(body.environment) : null;

  // 1. Signature
  const secret =
    (await supabase.rpc("get_integration_secret", { _key: "vanta_lookup_secret" })).data as string | null
    ?? (await supabase.rpc("get_integration_secret", { _key: "vanta_webhook_secret" })).data as string | null
    ?? Deno.env.get("VANTA_LOOKUP_SECRET")
    ?? Deno.env.get("VANTA_WEBHOOK_SECRET")
    ?? "";

  if (!secret || !sigHeader || !tsHeader) {
    await writeAudit(supabase, audit_id, {
      request_id, lookup_type: lookup_type || "unknown", lookup_id, purpose,
      authorized: false, signature_valid: false, response_status: "unauthorized",
      fields_returned: [], sensitivity_level: null, environment,
      error_summary: !secret ? "no_secret_configured" : "missing_signature_headers",
    });
    return jsonResponse({ ok: false, error: "unauthorized", message: "Request could not be verified." }, 401);
  }

  const tsNum = Number(tsHeader);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > MAX_TIMESTAMP_SKEW_SECONDS) {
    await writeAudit(supabase, audit_id, {
      request_id, lookup_type: lookup_type || "unknown", lookup_id, purpose,
      authorized: false, signature_valid: false, response_status: "stale_timestamp",
      fields_returned: [], sensitivity_level: null, environment, error_summary: "stale_or_invalid_timestamp",
    });
    return jsonResponse({ ok: false, error: "stale_timestamp", message: "Timestamp invalid." }, 401);
  }

  const expected = await hmacHex(secret, `${tsHeader}.${rawBody}`);
  const provided = sigHeader.replace(/^sha256=/, "");
  if (!constantTimeEqual(expected, provided)) {
    await writeAudit(supabase, audit_id, {
      request_id, lookup_type: lookup_type || "unknown", lookup_id, purpose,
      authorized: false, signature_valid: false, response_status: "invalid_signature",
      fields_returned: [], sensitivity_level: null, environment, error_summary: "hmac_mismatch",
    });
    return jsonResponse({ ok: false, error: "unauthorized", message: "Request could not be verified." }, 401);
  }

  if (sourceHeader && sourceHeader !== "vanta") {
    await writeAudit(supabase, audit_id, {
      request_id, lookup_type, lookup_id, purpose,
      authorized: false, signature_valid: true, response_status: "unauthorized",
      fields_returned: [], sensitivity_level: null, environment, error_summary: "bad_source",
    });
    return jsonResponse({ ok: false, error: "unauthorized", message: "Request could not be verified." }, 401);
  }

  // 2. Integration enabled check
  const { data: session } = await supabase
    .from("vanta_integration_session")
    .select("enabled")
    .limit(1)
    .maybeSingle();
  if (session && session.enabled === false) {
    await writeAudit(supabase, audit_id, {
      request_id, lookup_type, lookup_id, purpose,
      authorized: false, signature_valid: true, response_status: "integration_disabled",
      fields_returned: [], sensitivity_level: null, environment, error_summary: null,
    });
    return jsonResponse({ ok: false, error: "integration_disabled", message: "Vanta lookup is paused." }, 403);
  }

  // 3. Type + purpose validation
  if (!ALLOWED_LOOKUP_TYPES.has(lookup_type)) {
    await writeAudit(supabase, audit_id, {
      request_id, lookup_type: lookup_type || "unknown", lookup_id, purpose,
      authorized: true, signature_valid: true, response_status: "unsupported_lookup_type",
      fields_returned: [], sensitivity_level: null, environment, error_summary: null,
    });
    return jsonResponse({ ok: false, error: "unsupported_lookup_type", message: "This lookup type is not available yet." }, 400);
  }
  if (!purpose || !ALLOWED_PURPOSES.has(purpose)) {
    await writeAudit(supabase, audit_id, {
      request_id, lookup_type, lookup_id, purpose,
      authorized: true, signature_valid: true, response_status: "unsupported_purpose",
      fields_returned: [], sensitivity_level: null, environment, error_summary: null,
    });
    return jsonResponse({ ok: false, error: "unsupported_purpose", message: "Purpose is required." }, 400);
  }
  if (!lookup_id) {
    await writeAudit(supabase, audit_id, {
      request_id, lookup_type, lookup_id, purpose,
      authorized: true, signature_valid: true, response_status: "malformed_request",
      fields_returned: [], sensitivity_level: null, environment, error_summary: "missing_lookup_id",
    });
    return jsonResponse({ ok: false, error: "malformed_request", message: "lookup_id is required." }, 400);
  }

  // 4. Resolve by type
  try {
    let data: Record<string, unknown> | null = null;
    let sensitivity: "minimal" | "limited_pii" | "sensitive" = "minimal";
    let fields_returned: string[] = [];

    if (lookup_type === "booking") {
      const { data: b } = await supabase
        .from("bookings")
        .select("id, state, check_in, check_out, num_guests, total_price, notes, unit_id, guest_id")
        .eq("id", lookup_id)
        .maybeSingle();
      if (!b) {
        await writeAudit(supabase, audit_id, {
          request_id, lookup_type, lookup_id, purpose,
          authorized: true, signature_valid: true, response_status: "not_found",
          fields_returned: [], sensitivity_level: null, environment, error_summary: null,
        });
        return jsonResponse({ ok: false, error: "not_found", message: "No matching record found." }, 404);
      }
      const { data: u } = b.unit_id
        ? await supabase.from("units").select("name").eq("id", b.unit_id).maybeSingle()
        : { data: null as any };
      const { data: p } = b.guest_id
        ? await supabase.from("profiles").select("full_name, email, phone, whatsapp, line_id, preferred_language")
            .eq("user_id", b.guest_id).maybeSingle()
        : { data: null as any };

      const base: Record<string, unknown> = {
        booking_id: b.id,
        booking_state: b.state,
        check_in: b.check_in,
        check_out: b.check_out,
        unit_label: u?.name ?? null,
        guest_display_name: firstName(p?.full_name),
        guest_language: p?.preferred_language ?? "en",
        safe_contact_channel: p ? safeContactChannel(p) : "none",
      };
      fields_returned = Object.keys(base);

      if (purpose === "draft_confirmation" || purpose === "draft_guest_reply") {
        if (p?.email) {
          base.guest_email = p.email;
          fields_returned.push("guest_email");
          sensitivity = "limited_pii";
        }
      }
      if (purpose === "review_booking" || purpose === "dashboard_review") {
        base.num_guests = b.num_guests;
        base.total_price_summary = b.total_price != null ? Number(b.total_price) : null;
        fields_returned.push("num_guests", "total_price_summary");
        if (purpose === "review_booking" && b.notes) {
          base.notes_summary = String(b.notes).slice(0, 240);
          fields_returned.push("notes_summary");
        }
      }
      data = base;
    } else if (lookup_type === "maintenance_ticket") {
      const { data: m } = await supabase
        .from("maintenance_requests")
        .select("id, booking_id, unit_id, category, status, priority, description, created_at, updated_at")
        .eq("id", lookup_id)
        .maybeSingle();
      if (!m) {
        await writeAudit(supabase, audit_id, {
          request_id, lookup_type, lookup_id, purpose,
          authorized: true, signature_valid: true, response_status: "not_found",
          fields_returned: [], sensitivity_level: null, environment, error_summary: null,
        });
        return jsonResponse({ ok: false, error: "not_found", message: "No matching record found." }, 404);
      }
      const { data: u } = m.unit_id
        ? await supabase.from("units").select("name").eq("id", m.unit_id).maybeSingle()
        : { data: null as any };
      data = {
        ticket_id: m.id,
        booking_id: m.booking_id,
        unit_label: u?.name ?? null,
        category: m.category,
        status: m.status,
        priority: m.priority,
        issue_summary: String(m.description ?? "").slice(0, 240),
        created_at: m.created_at,
        last_updated_at: m.updated_at,
      };
      fields_returned = Object.keys(data);
    } else if (lookup_type === "guest") {
      const { data: p } = await supabase
        .from("profiles")
        .select("user_id, full_name, preferred_language, email, phone, whatsapp, line_id")
        .eq("user_id", lookup_id)
        .maybeSingle();
      if (!p) {
        await writeAudit(supabase, audit_id, {
          request_id, lookup_type, lookup_id, purpose,
          authorized: true, signature_valid: true, response_status: "not_found",
          fields_returned: [], sensitivity_level: null, environment, error_summary: null,
        });
        return jsonResponse({ ok: false, error: "not_found", message: "No matching record found." }, 404);
      }
      const base: Record<string, unknown> = {
        guest_id: p.user_id,
        display_name: firstName(p.full_name),
        preferred_language: p.preferred_language ?? "en",
        safe_contact_channel: safeContactChannel(p),
      };
      fields_returned = Object.keys(base);
      if (purpose === "draft_confirmation" || purpose === "draft_guest_reply") {
        if (p.email) { base.email = p.email; fields_returned.push("email"); sensitivity = "limited_pii"; }
      }
      data = base;
    } else if (lookup_type === "unit") {
      const { data: u } = await supabase
        .from("units").select("id, name, capacity").eq("id", lookup_id).maybeSingle();
      if (!u) {
        await writeAudit(supabase, audit_id, {
          request_id, lookup_type, lookup_id, purpose,
          authorized: true, signature_valid: true, response_status: "not_found",
          fields_returned: [], sensitivity_level: null, environment, error_summary: null,
        });
        return jsonResponse({ ok: false, error: "not_found", message: "No matching record found." }, 404);
      }
      data = { unit_id: u.id, unit_label: u.name, capacity: u.capacity };
      fields_returned = Object.keys(data);
    } else {
      // guest_message, payment_signal, accommodation_file — declared but not yet wired.
      await writeAudit(supabase, audit_id, {
        request_id, lookup_type, lookup_id, purpose,
        authorized: true, signature_valid: true, response_status: "unsupported_lookup_type",
        fields_returned: [], sensitivity_level: null, environment, error_summary: "not_yet_implemented",
      });
      return jsonResponse({ ok: false, error: "unsupported_lookup_type", message: "This lookup type is not available yet." }, 400);
    }

    await writeAudit(supabase, audit_id, {
      request_id, lookup_type, lookup_id, purpose,
      authorized: true, signature_valid: true, response_status: "ok",
      fields_returned, sensitivity_level: sensitivity, environment, error_summary: null,
    });

    return jsonResponse({
      ok: true,
      lookup_type,
      lookup_id,
      purpose,
      data,
      sensitivity,
      expires_hint_seconds: 300,
      audit_id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "internal_error";
    await writeAudit(supabase, audit_id, {
      request_id, lookup_type, lookup_id, purpose,
      authorized: true, signature_valid: true, response_status: "internal_error",
      fields_returned: [], sensitivity_level: null, environment, error_summary: msg.slice(0, 240),
    });
    return jsonResponse({ ok: false, error: "internal_error", message: "Lookup failed." }, 500);
  }
});
