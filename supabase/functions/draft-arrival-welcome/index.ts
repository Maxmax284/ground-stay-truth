// draft-arrival-welcome
// -----------------------------------------------------------------------------
// AI-drafted, location-aware welcome message for an incoming guest.
// Staff-facing DRAFT only — nothing gets sent from here. A human reviews and
// hits send inside the platform. That's the "capture, don't control" rule.
//
// Uses the Lovable AI Gateway behind `_shared/aiGuard.ts` (budget + rate
// limit). Falls back gracefully if AI is unavailable.
// -----------------------------------------------------------------------------
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") || "https://ground-stay-truth.lovable.app",
  "https://ground-stay-truth.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Lovable preview/dev origins
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

/** Build property-aware airport context dynamically */
function buildAirportInfo(airport: string, propertyName: string, operationalMode: string): string {
  const propertyDesc = operationalMode === "high_turnover"
    ? `a Muay Thai fight camp accommodation called ${propertyName}`
    : `a boutique guesthouse called ${propertyName}`;

  if (airport === "bkk") {
    return `Suvarnabhumi Airport (BKK), Bangkok. Large international airport — guests need substantial guidance.
GUIDANCE DENSITY: HIGH. BKK is overwhelming for first-timers. Cover immigration queues, SIM/cash, terminal navigation, domestic transfers, and taxi scam awareness in detail. Use numbered steps. Assume the guest knows nothing.
Guests arriving for ${propertyDesc}.`;
  }
  return `Koh Samui Airport (USM). Small open-air boutique airport — minimal guidance needed.
GUIDANCE DENSITY: LOW. USM is simple: exit the plane, walk across the tarmac, grab your bag, walk out. Do NOT over-explain. Keep it to 2-3 sentences per section max. The pickup driver is right outside.
Guests arriving for ${propertyDesc}.`;
}

const TONE_INSTRUCTIONS: Record<string, string> = {
  friendly: "Warm, welcoming, uses first-person plural ('we'). Light emoji. Like a friend picking you up.",
  professional: "Clear, polished, respectful. Minimal emoji. Like a boutique hotel concierge.",
  casual: "Super relaxed, conversational. Emoji welcome. Like a text from a mate.",
  minimal: "Ultra-concise. Bullet points only. No fluff. Just the essential steps.",
};

async function verifyStaff(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");

  const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["admin", "manager"]);
  if (!roles?.length) throw new Error("Admin or manager role required");
  return { user, serviceClient };
}

/** Fetch property metadata for context-building */
async function fetchPropertyContext(serviceClient: any, propertyId?: string): Promise<{ name: string; operationalMode: string }> {
  if (!propertyId) {
    return { name: "Ground Stay", operationalMode: "high_turnover" };
  }
  const { data, error } = await serviceClient
    .from("properties")
    .select("name, operational_mode")
    .eq("id", propertyId)
    .single();
  if (error || !data) {
    console.warn("Could not fetch property, using defaults:", error?.message);
    return { name: "Ground Stay", operationalMode: "high_turnover" };
  }
  return { name: data.name, operationalMode: data.operational_mode };
}

async function callAI(messages: any[], tools?: any[], toolChoice?: any) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("AI not configured");

  const body: any = {
    model: "google/gemini-3-flash-preview",
    messages,
  };
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    if (resp.status === 429) throw { status: 429, message: "Rate limited, please try again in a moment." };
    if (resp.status === 402) throw { status: 402, message: "AI credits exhausted. Add funds in Settings → Workspace → Usage." };
    const t = await resp.text();
    console.error("AI error:", resp.status, t);
    throw new Error("AI request failed");
  }
  return resp.json();
}

function cleanJsonString(str: string): string {
  return str.replace(/,\s*([}\]])/g, "$1");
}

function extractToolArgs(aiData: any): any {
  console.log("AI response structure:", JSON.stringify({
    hasChoices: !!aiData.choices,
    choiceCount: aiData.choices?.length,
    finishReason: aiData.choices?.[0]?.finish_reason,
    hasToolCalls: !!aiData.choices?.[0]?.message?.tool_calls,
    hasContent: !!aiData.choices?.[0]?.message?.content,
  }));

  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    const args = toolCall.function.arguments;
    if (typeof args === "object") return args;
    try {
      return JSON.parse(args);
    } catch {
      try {
        return JSON.parse(cleanJsonString(args));
      } catch (e2) {
        console.error("Failed to parse tool_call arguments:", args.substring(0, 500));
        throw new Error("Could not parse tool call arguments");
      }
    }
  }

  const content = aiData.choices?.[0]?.message?.content || "";
  if (content) {
    console.log("Falling back to content extraction, content length:", content.length);
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try { return JSON.parse(cleanJsonString(codeBlockMatch[1].trim())); } catch {}
    }
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(cleanJsonString(jsonMatch[0])); } catch {}
    }
    return { reply: content, updated_template: null };
  }

  throw new Error("Could not parse AI response - no tool calls or content found");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const { user, serviceClient } = await verifyStaff(req);

    const body = await req.json();
    const { airport, context, mode, section, tone, current_template, chat_history, user_message, property_id } = body;

    if (!airport || !["bkk", "samui"].includes(airport)) {
      return new Response(JSON.stringify({ error: "airport must be 'bkk' or 'samui'" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch property context for dynamic identity
    const propertyCtx = await fetchPropertyContext(serviceClient, property_id);
    const airportInfo = buildAirportInfo(airport, propertyCtx.name, propertyCtx.operationalMode);
    const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.friendly;

    // Property-aware accommodation term
    const accommodationTerm = propertyCtx.operationalMode === "high_turnover" ? "camp" : "accommodation";

    const baseContext = `You are a content writer for ${propertyCtx.name}, ${
      propertyCtx.operationalMode === "high_turnover"
        ? "a Muay Thai fight camp accommodation"
        : "a boutique guesthouse"
    } on Koh Samui, Thailand.
Airport context: ${airportInfo}
Tone: ${toneInstruction}
IMPORTANT: Refer to the accommodation as "${propertyCtx.name}" or "your ${accommodationTerm}". Do NOT use generic terms like "the camp" if this is a guesthouse.`;

    // ── Mode: suggest_sections ──
    if (mode === "suggest_sections") {
      const existingSections = current_template?.sections?.map((s: any) => s.title).filter(Boolean) || [];
      const prompt = `${baseContext}

The admin is building an arrival welcome guide for guests landing at ${airport.toUpperCase()}.
${existingSections.length > 0 ? `Existing sections: ${existingSections.join(", ")}` : "No sections exist yet."}
${context ? `Admin notes: ${context}` : ""}

Suggest 4-5 sections that would be useful in this guide. For existing sections, don't repeat them — suggest NEW ones that would complement what's already there.`;

      const aiData = await callAI(
        [{ role: "system", content: prompt }, { role: "user", content: "Suggest sections for this arrival guide." }],
        [{
          type: "function",
          function: {
            name: "suggest_sections",
            description: "Suggest sections for the welcome guide",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "Section title" },
                      description: { type: "string", description: "Brief description of what this section would cover (1 sentence)" },
                      content: { type: "string", description: "Full draft content for this section" },
                    },
                    required: ["title", "description", "content"],
                  },
                },
              },
              required: ["suggestions"],
            },
          },
        }],
        { type: "function", function: { name: "suggest_sections" } }
      );

      const result = extractToolArgs(aiData);
      return new Response(JSON.stringify({ suggestions: result.suggestions || [] }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── Mode: refine_chat ──
    if (mode === "refine_chat") {
      const currentSections = current_template?.sections?.map((s: any, i: number) =>
        `[Section ${i + 1}: "${s.title}"] ${s.content}`
      ).join("\n\n") || "(empty)";

      const systemMsg = `${baseContext}

You are helping an admin refine an arrival welcome guide through conversation.

Current welcome message: "${current_template?.welcome_message || "(empty)"}"

Current sections:
${currentSections}

${context ? `Admin notes: ${context}` : ""}

When the admin asks you to change something, respond with BOTH:
1. A brief conversational reply explaining what you did
2. The updated template

If the request is unclear or just a question, respond conversationally without updating the template.`;

      const messages: any[] = [{ role: "system", content: systemMsg }];
      if (Array.isArray(chat_history)) {
        for (const msg of chat_history) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
      messages.push({ role: "user", content: user_message });

      const aiData = await callAI(
        messages,
        [{
          type: "function",
          function: {
            name: "refine_guide",
            description: "Return the conversational reply and optionally an updated template",
            parameters: {
              type: "object",
              properties: {
                reply: { type: "string", description: "Conversational reply to the admin" },
                updated_template: {
                  type: "object",
                  description: "Updated template if changes were made, null if just answering a question",
                  properties: {
                    welcome_message: { type: "string" },
                    sections: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          content: { type: "string" },
                        },
                        required: ["title", "content"],
                      },
                    },
                  },
                },
              },
              required: ["reply"],
            },
          },
        }],
        { type: "function", function: { name: "refine_guide" } }
      );

      const result = extractToolArgs(aiData);
      return new Response(JSON.stringify({
        reply: result.reply,
        updated_template: result.updated_template || null,
      }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── Mode: generate_section ──
    if (mode === "generate_section") {
      const { section_type, section_title, guided_fields, airport_facts, quick_draft } = body;

      let fieldsSummary = "";
      if (guided_fields && typeof guided_fields === "object") {
        for (const [key, value] of Object.entries(guided_fields)) {
          if (!value || (Array.isArray(value) && value.length === 0) || value === "") continue;
          const displayVal = Array.isArray(value) ? value.join("\n  • ") : value;
          fieldsSummary += `\n${key}: ${Array.isArray(value) ? "\n  • " + displayVal : displayVal}`;
        }
      }

      const densityNote = airport === "bkk"
        ? "This is BKK — provide DETAILED step-by-step guidance. Guests need hand-holding through a complex airport."
        : "This is USM — keep it SHORT and DIRECT. The airport is tiny. Don't over-explain.";

      const genPrompt = `${baseContext}

You are writing a specific section of an arrival welcome guide for guests arriving at ${airport.toUpperCase()}.

${densityNote}

Section type: ${section_type}
Section title: "${section_title}"

${quick_draft ? `The admin described what they want in natural language:\n"${quick_draft}"\n\nInterpret this and write structured, polished content based on their intent.` : ""}

Here are the structured facts and details to include in this section:
${fieldsSummary || "(No specific fields provided — use your best judgment based on the airport context)"}

IMPORTANT: The provided field values are verified facts. Do NOT invent prices, times, distances, or details not provided.

${context ? `Admin notes: ${context}` : ""}

Write a well-structured, practical section that:
- Uses the provided facts accurately
- Is formatted with clear numbered steps or bullet points where appropriate
- Feels natural and helpful, not like a data dump
- Uses emoji sparingly and appropriately
- Is concise but thorough — every sentence should be useful
- Matches the guidance density level for this airport
- Refers to the accommodation as "${propertyCtx.name}" — never as "the camp" unless it IS a camp`;

      const aiData = await callAI(
        [{ role: "system", content: genPrompt }, { role: "user", content: `Write the "${section_title}" section.` }],
        [{
          type: "function",
          function: {
            name: "write_section",
            description: "Return the written section",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Section title (can refine the provided title)" },
                content: { type: "string", description: "Full section content" },
              },
              required: ["title", "content"],
            },
          },
        }],
        { type: "function", function: { name: "write_section" } }
      );

      const draft = extractToolArgs(aiData);
      return new Response(JSON.stringify({ draft }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── Mode: rewrite_section ──
    if (mode === "rewrite_section") {
      const sectionToRewrite = section || body.section;
      if (!sectionToRewrite) {
        return new Response(JSON.stringify({ error: "section is required for rewrite_section mode" }), {
          status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      let fieldsContext = "";
      if (body.guided_fields && typeof body.guided_fields === "object") {
        for (const [key, value] of Object.entries(body.guided_fields)) {
          if (!value || (Array.isArray(value) && value.length === 0) || value === "") continue;
          const displayVal = Array.isArray(value) ? value.join(", ") : value;
          fieldsContext += `\n${key}: ${displayVal}`;
        }
      }

      const sectionPrompt = `${baseContext}

Rewrite/improve the following section from an arrival welcome guide for guests landing at ${airport.toUpperCase()}.

Current section title: "${sectionToRewrite.title}"
Current section content: "${sectionToRewrite.content}"

${fieldsContext ? `Reference facts to ensure accuracy:\n${fieldsContext}` : ""}

Return an improved version. Keep the same topic but make it clearer, more practical, and friendlier. Use concise numbered steps where appropriate. Don't be corporate. Use emoji sparingly.
Refer to the accommodation as "${propertyCtx.name}" — never generically as "the camp" unless it IS a camp.
${context ? `\nAdmin notes: ${context}` : ""}`;

      const aiData = await callAI(
        [{ role: "system", content: sectionPrompt }, { role: "user", content: "Rewrite this section." }],
        [{
          type: "function",
          function: {
            name: "rewrite_section",
            description: "Return the rewritten section",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                content: { type: "string" },
              },
              required: ["title", "content"],
            },
          },
        }],
        { type: "function", function: { name: "rewrite_section" } }
      );

      const draft = extractToolArgs(aiData);
      return new Response(JSON.stringify({ draft }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── Mode: full draft (default) ──
    const systemPrompt = `${baseContext}

You're drafting an arrival welcome guide for guests landing at ${airport.toUpperCase()}.
Include 3-4 sections covering: immediate next steps after landing, getting to ${propertyCtx.name}, and practical tips.
Keep it practical and concise. Use emoji sparingly. Don't be corporate.
${context ? `\nAdditional context from the admin: ${context}` : ""}`;

    const aiData = await callAI(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Draft the arrival welcome guide for ${airport.toUpperCase()} airport.` },
      ],
      [{
        type: "function",
        function: {
          name: "create_welcome_guide",
          description: "Create a structured arrival welcome guide",
          parameters: {
            type: "object",
            properties: {
              welcome_message: { type: "string" },
              sections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    content: { type: "string" },
                  },
                  required: ["title", "content"],
                },
              },
            },
            required: ["welcome_message", "sections"],
          },
        },
      }],
      { type: "function", function: { name: "create_welcome_guide" } }
    );

    const draft = extractToolArgs(aiData);
    return new Response(JSON.stringify({ draft }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("draft-arrival-welcome error:", err);
    const status = err.status || 500;
    const message = err.message || String(err);
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
