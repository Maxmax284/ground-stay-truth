// verify-document
// -----------------------------------------------------------------------------
// AI-assisted ID / passport verification. ADVISORY ONLY — the output is a
// suggestion for the human reviewer, never a hard block. If the AI says
// "looks fake" we surface a warning; staff still make the call.
//
// SECURITY: reads from the private `guest-documents` storage bucket. Guarded
// by `_shared/aiGuard.ts` for budget and rate limits. Never log the actual
// document contents — only the verdict + confidence.
// -----------------------------------------------------------------------------
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

const FN = "verify-document";
const MODEL = "google/gemini-2.5-flash";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const t0 = Date.now();
  const ipHash = await hashIp(req);

  try {
    const { documentId, filePath, expectedType } = await req.json();
    if (!documentId || !filePath) {
      return new Response(JSON.stringify({ error: "documentId and filePath required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Resolve actor + property for governance
    const { data: docRow } = await supabase
      .from("guest_documents")
      .select("uploaded_by, booking_id, bookings!inner(property_id)")
      .eq("id", documentId)
      .maybeSingle();
    const actorId: string | null = (docRow as any)?.uploaded_by ?? null;
    const propertyId: string | null = (docRow as any)?.bookings?.property_id ?? null;
    const { role } = await resolveRoleAndProperty(supabase, actorId);

    // AI Guard
    const decision = await checkAiGuard({
      functionName: FN, actorId, actorRole: role, propertyId, channel: "web", ipHash,
    });
    if (!decision.allow) {
      await supabase.from("guest_documents")
        .update({ verification_status: "error", verification_notes: { error: decision.reason } })
        .eq("id", documentId);
      return new Response(JSON.stringify({ error: decision.reason }), {
        status: decision.status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("guest_documents")
      .update({ verification_status: "analyzing" })
      .eq("id", documentId);

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("guest-documents")
      .download(filePath);

    if (downloadError || !fileData) {
      await supabase
        .from("guest_documents")
        .update({ verification_status: "error", verified_at: new Date().toISOString() })
        .eq("id", documentId);
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    if (fileData.size > MAX_BYTES) {
      await supabase.from("guest_documents")
        .update({ verification_status: "error", verification_notes: { error: "File too large" }, verified_at: new Date().toISOString() })
        .eq("id", documentId);
      await logAiUsage({ functionName: FN, actorId, actorRole: role, propertyId, status: "blocked", errorCode: "file_too_large", ipHash });
      return new Response(JSON.stringify({ error: "File exceeds 10 MB limit." }), {
        status: 413, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const mimeType = fileData.type || "image/jpeg";
    if (!ALLOWED_MIME.has(mimeType)) {
      await supabase.from("guest_documents")
        .update({ verification_status: "error", verification_notes: { error: `Unsupported file type: ${mimeType}` }, verified_at: new Date().toISOString() })
        .eq("id", documentId);
      await logAiUsage({ functionName: FN, actorId, actorRole: role, propertyId, status: "blocked", errorCode: "bad_mime", ipHash });
      return new Response(JSON.stringify({ error: "Only JPEG, PNG, WebP, or PDF allowed." }), {
        status: 415, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `You are an advisory document reviewer for a hospitality property management system. Your role is to analyze uploaded identification documents and provide structured feedback to staff.

IMPORTANT GUIDELINES:
- You are ADVISORY ONLY. Never make accept/reject decisions.
- Flag concerns but do not make accusations.
- Assess document quality, readability, and basic validity indicators.
- Do not extract or store actual personal data (names, numbers, dates) in your response — only indicate whether fields are readable or not.
- Be precise about WHAT the image actually is. Many guests upload the wrong thing:
  a Thai Digital Arrival Card / TDAC QR page, a boarding pass, a flight ticket,
  a visa page, a hotel voucher, or a random photo. These are NOT passports.
- A passport photo page shows the holder photo, the machine-readable zone (two
  lines of characters at the bottom), and the passport number. If those are not
  visible, it is not a passport photo page.
- Set is_identity_document to false for anything that is not a government photo ID.
- Be concise and professional.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Analyze this uploaded image. The property expected: ${expectedType ?? "passport"}. Identify exactly what the image is and whether it is a government-issued photo ID. Use the analyze_document tool.` },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          },

        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_document",
              description: "Return structured analysis of an identification document.",
              parameters: {
                type: "object",
                properties: {
                  document_type: { type: "string", enum: ["passport", "national_id", "drivers_license", "residence_permit", "visa_page", "thai_arrival_card", "boarding_pass", "flight_ticket", "other_document", "not_a_document", "unknown"] },
                  is_identity_document: { type: "boolean", description: "True only for a government-issued photo ID (passport, national ID, driver's licence, residence permit)." },
                  issuing_country: { type: "string" },
                  expiry_date: { type: "string" },
                  is_expired: { type: "boolean" },
                  holder_name_readable: { type: "boolean" },
                  document_number_readable: { type: "boolean" },
                  quality_issues: { type: "array", items: { type: "string" } },
                  confidence: { type: "string", enum: ["low", "medium", "high"] },
                  summary: { type: "string" },
                },
                required: [
                  "document_type", "is_identity_document", "issuing_country", "is_expired",
                  "holder_name_readable", "document_number_readable",
                  "quality_issues", "confidence", "summary",
                ],

                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_document" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      await logAiUsage({
        functionName: FN, actorId, actorRole: role, propertyId,
        status: "provider_error", model: MODEL, errorCode: `upstream_${aiResponse.status}`,
        latencyMs: Date.now() - t0, ipHash,
      });
      await supabase
        .from("guest_documents")
        .update({
          verification_status: "error",
          verification_notes: { error: `AI analysis failed (${aiResponse.status})` },
          verified_at: new Date().toISOString(),
        })
        .eq("id", documentId);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const usage = aiData.usage ?? {};
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      await logAiUsage({
        functionName: FN, actorId, actorRole: role, propertyId,
        status: "provider_error", model: MODEL, errorCode: "no_tool_call",
        tokensIn: usage.prompt_tokens ?? 0, tokensOut: usage.completion_tokens ?? 0,
        latencyMs: Date.now() - t0, ipHash,
      });
      await supabase
        .from("guest_documents")
        .update({
          verification_status: "error",
          verification_notes: { error: "AI did not return structured output" },
          verified_at: new Date().toISOString(),
        })
        .eq("id", documentId);
      return new Response(JSON.stringify({ error: "No structured output" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const analysis = JSON.parse(toolCall.function.arguments);

    const isFlagged =
      analysis.confidence === "low" ||
      analysis.is_expired ||
      (analysis.quality_issues && analysis.quality_issues.length > 0) ||
      analysis.document_type === "unknown";

    const status = isFlagged ? "flagged" : "clear";

    await supabase
      .from("guest_documents")
      .update({
        verification_status: status,
        verification_notes: analysis,
        verified_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    await logAiUsage({
      functionName: FN, actorId, actorRole: role, propertyId,
      status: "ok", model: MODEL,
      tokensIn: usage.prompt_tokens ?? 0,
      tokensOut: usage.completion_tokens ?? 0,
      latencyMs: Date.now() - t0, ipHash,
    });

    return new Response(JSON.stringify({ status, analysis }), {
      status: 200,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("verify-document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
