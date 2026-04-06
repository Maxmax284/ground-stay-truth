import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, filePath } = await req.json();
    if (!documentId || !filePath) {
      return new Response(JSON.stringify({ error: "documentId and filePath required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Mark as analyzing
    await supabase
      .from("guest_documents")
      .update({ verification_status: "analyzing" })
      .eq("id", documentId);

    // Download the document from storage
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

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const mimeType = fileData.type || "image/jpeg";

    // Call Lovable AI Gateway with vision
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an advisory document reviewer for a hospitality property management system. Your role is to analyze uploaded identification documents and provide structured feedback to staff.

IMPORTANT GUIDELINES:
- You are ADVISORY ONLY. Never make accept/reject decisions.
- Flag concerns but do not make accusations.
- Assess document quality, readability, and basic validity indicators.
- Do not extract or store actual personal data (names, numbers, dates) in your response — only indicate whether fields are readable or not.
- If the image is not an identification document, indicate that clearly.
- Be concise and professional.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this identification document image. Use the analyze_document tool to provide your structured assessment.",
              },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
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
                  document_type: {
                    type: "string",
                    enum: ["passport", "national_id", "drivers_license", "residence_permit", "unknown"],
                    description: "Type of identification document detected",
                  },
                  issuing_country: {
                    type: "string",
                    description: "Country that issued the document, or 'unknown'",
                  },
                  expiry_date: {
                    type: "string",
                    description: "Expiry date if visible (format: YYYY-MM or YYYY), or null if not visible",
                  },
                  is_expired: {
                    type: "boolean",
                    description: "Whether the document appears to be expired based on visible expiry date",
                  },
                  holder_name_readable: {
                    type: "boolean",
                    description: "Whether the holder's name is clearly readable",
                  },
                  document_number_readable: {
                    type: "boolean",
                    description: "Whether the document number is clearly readable",
                  },
                  quality_issues: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of quality concerns, e.g. 'blurry text', 'low resolution', 'glare obscuring data', 'possible digital alteration'",
                  },
                  confidence: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                    description: "Overall confidence that the document appears genuine",
                  },
                  summary: {
                    type: "string",
                    description: "One-line human-readable summary of the assessment",
                  },
                },
                required: [
                  "document_type",
                  "issuing_country",
                  "is_expired",
                  "holder_name_readable",
                  "document_number_readable",
                  "quality_issues",
                  "confidence",
                  "summary",
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const analysis = JSON.parse(toolCall.function.arguments);

    // Determine status: flagged if low confidence, expired, or has quality issues
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

    return new Response(JSON.stringify({ status, analysis }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("verify-document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
