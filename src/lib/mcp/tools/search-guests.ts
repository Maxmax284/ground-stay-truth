import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { logMcpActivity } from "../log";

/**
 * PII-safe guest search. Returns only fields staff routinely see in the guest list.
 * Full contact details still require opening the booking sheet, which enforces the
 * same audit trail as the web UI.
 */
export default defineTool({
  name: "search_guests",
  title: "Search guests",
  description:
    "Search guest profiles by name or email (case-insensitive). RLS-scoped — returns only what the signed-in user is permitted to see. Contact numbers are masked.",
  inputSchema: {
    query: z.string().min(2).max(80).describe("At least 2 characters. Matches name or email substring."),
    limit: z.number().int().positive().max(25).optional().describe("Max rows (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx: ToolContext) => {
    const startedAt = Date.now();
    if (!ctx.isAuthenticated()) {
      await logMcpActivity({ ctx, toolName: "search_guests", startedAt, success: false, errorMessage: "not_authenticated" });
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const safe = query.replace(/[%,]/g, "").trim();
    const pattern = `%${safe}%`;
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, phone, preferred_language, created_at")
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(limit ?? 10);
    if (error) {
      await logMcpActivity({ ctx, toolName: "search_guests", startedAt, success: false, errorMessage: error.message, inputSummary: { query_len: query.length } });
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    const maskPhone = (p: string | null) => {
      if (!p) return null;
      const digits = p.replace(/\D/g, "");
      if (digits.length < 4) return "***";
      return `***${digits.slice(-4)}`;
    };
    const safeRows = (data ?? []).map((r: any) => ({
      user_id: r.user_id,
      full_name: r.full_name,
      email: r.email,
      phone_last4: maskPhone(r.phone),
      preferred_language: r.preferred_language,
      created_at: r.created_at,
    }));
    await logMcpActivity({ ctx, toolName: "search_guests", startedAt, success: true, rowCount: safeRows.length, inputSummary: { query_len: query.length } });
    return {
      content: [{ type: "text", text: JSON.stringify(safeRows) }],
      structuredContent: { guests: safeRows },
    };
  },
});
