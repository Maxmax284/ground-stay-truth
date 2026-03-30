import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin/manager role
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roles } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "manager"]);
    if (!roles?.length) {
      return new Response(JSON.stringify({ error: "Admin or manager role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { airport, context, mode, section } = body;

    if (!airport || !["bkk", "samui"].includes(airport)) {
      return new Response(JSON.stringify({ error: "airport must be 'bkk' or 'samui'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const airportInfo: Record<string, string> = {
      bkk: "Suvarnabhumi Airport (BKK), Bangkok. Large international airport. Drive to Koh Samui area takes ~2-3 hours or domestic flight. Guests arriving for a Muay Thai fight camp accommodation called Ground Stay / Lamai Muay Thai.",
      samui: "Koh Samui Airport (USM). Small open-air boutique airport. Drive to camp takes ~20-30 minutes. Guests arriving for a Muay Thai fight camp accommodation called Ground Stay / Lamai Muay Thai.",
    };

    // ── Section rewrite mode ──
    if (mode === "rewrite_section" && section) {
      const sectionPrompt = `You are a content writer for Ground Stay, a Muay Thai fight camp accommodation in Thailand.
Rewrite/improve the following section from an arrival welcome guide for guests landing at ${airport.toUpperCase()}.

Airport context: ${airportInfo[airport]}

Current section title: "${section.title}"
Current section content: "${section.content}"

Return an improved version as a JSON object with "title" and "content" fields.
Keep the same topic but make it clearer, more practical, and friendlier. Use concise numbered steps where appropriate. Don't be corporate. Use emoji sparingly.
${context ? `\nAdmin notes: ${context}` : ""}`;

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: sectionPrompt },
            { role: "user", content: "Rewrite this section." },
          ],
          tools: [{
            type: "function",
            function: {
              name: "rewrite_section",
              description: "Return the rewritten section",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Improved section title" },
                  content: { type: "string", description: "Improved section content" },
                },
                required: ["title", "content"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "rewrite_section" } },
        }),
      });

      if (!aiResponse.ok) {
        if (aiResponse.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited, please try again in a moment." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiResponse.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await aiResponse.text();
        console.error("AI error:", aiResponse.status, t);
        return new Response(JSON.stringify({ error: "AI rewrite failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiData = await aiResponse.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      let draft;
      if (toolCall?.function?.arguments) {
        draft = typeof toolCall.function.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;
      } else {
        const content = aiData.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          draft = JSON.parse(jsonMatch[0]);
        } else {
          return new Response(JSON.stringify({ error: "Could not parse AI rewrite" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ draft }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Full draft mode (default) ──
    const systemPrompt = `You are a content writer for Ground Stay, a Muay Thai fight camp accommodation in Thailand. 
You're drafting an arrival welcome guide for guests landing at ${airport.toUpperCase()}.

Airport context: ${airportInfo[airport]}

Generate a JSON object with this exact structure:
{
  "welcome_message": "A warm, concise welcome message (1-2 sentences)",
  "sections": [
    { "title": "Section title", "content": "Section content with numbered steps or bullet points" }
  ]
}

Include 3-4 sections covering: immediate next steps after landing, getting to the camp, and practical tips.
Keep it friendly, practical, and concise. Use emoji sparingly. Don't be corporate.
${context ? `\nAdditional context from the admin: ${context}` : ""}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Draft the arrival welcome guide for ${airport.toUpperCase()} airport.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_welcome_guide",
            description: "Create a structured arrival welcome guide",
            parameters: {
              type: "object",
              properties: {
                welcome_message: { type: "string", description: "Warm welcome message" },
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
        tool_choice: { type: "function", function: { name: "create_welcome_guide" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResponse.text();
      console.error("AI error:", aiResponse.status, t);
      return new Response(JSON.stringify({ error: "AI draft failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let draft;
    if (toolCall?.function?.arguments) {
      draft = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } else {
      const content = aiData.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        draft = JSON.parse(jsonMatch[0]);
      } else {
        return new Response(JSON.stringify({ error: "Could not parse AI draft" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ draft }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("draft-arrival-welcome error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
