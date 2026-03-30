import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AIRPORT_INFO: Record<string, string> = {
  bkk: "Suvarnabhumi Airport (BKK), Bangkok. Large international airport. Drive to Koh Samui area takes ~2-3 hours or domestic flight. Guests arriving for a Muay Thai fight camp accommodation called Ground Stay / Lamai Muay Thai.",
  samui: "Koh Samui Airport (USM). Small open-air boutique airport. Drive to camp takes ~20-30 minutes. Guests arriving for a Muay Thai fight camp accommodation called Ground Stay / Lamai Muay Thai.",
};

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
  return user;
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

function extractToolArgs(aiData: any): any {
  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    return typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;
  }
  const content = aiData.choices?.[0]?.message?.content || "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);
  throw new Error("Could not parse AI response");
}

function extractContent(aiData: any): string {
  return aiData.choices?.[0]?.message?.content || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await verifyStaff(req);

    const body = await req.json();
    const { airport, context, mode, section, tone, current_template, chat_history, user_message } = body;

    if (!airport || !["bkk", "samui"].includes(airport)) {
      return new Response(JSON.stringify({ error: "airport must be 'bkk' or 'samui'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.friendly;
    const baseContext = `You are a content writer for Ground Stay, a Muay Thai fight camp accommodation in Thailand.
Airport context: ${AIRPORT_INFO[airport]}
Tone: ${toneInstruction}`;

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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Mode: rewrite_section ──
    if (mode === "rewrite_section" && section) {
      const sectionPrompt = `${baseContext}

Rewrite/improve the following section from an arrival welcome guide for guests landing at ${airport.toUpperCase()}.

Current section title: "${section.title}"
Current section content: "${section.content}"

Return an improved version. Keep the same topic but make it clearer, more practical, and friendlier. Use concise numbered steps where appropriate. Don't be corporate. Use emoji sparingly.
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Mode: full draft (default) ──
    const systemPrompt = `${baseContext}

You're drafting an arrival welcome guide for guests landing at ${airport.toUpperCase()}.
Include 3-4 sections covering: immediate next steps after landing, getting to the camp, and practical tips.
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("draft-arrival-welcome error:", err);
    const status = err.status || 500;
    const message = err.message || String(err);
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
