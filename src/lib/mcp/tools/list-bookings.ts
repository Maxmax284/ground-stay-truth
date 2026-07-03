import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { logMcpActivity } from "../log";

export default defineTool({
  name: "list_bookings",
  title: "List bookings",
  description:
    "List bookings the signed-in user can see (RLS-scoped). Supports optional state filter and limit.",
  inputSchema: {
    state: z
      .string()
      .optional()
      .describe("Optional booking state filter, e.g. 'confirmed', 'checked_in', 'pending_deposit'."),
    limit: z.number().int().positive().max(50).optional().describe("Max rows (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ state, limit }, ctx: ToolContext) => {
    const startedAt = Date.now();
    if (!ctx.isAuthenticated()) {
      await logMcpActivity({ ctx, toolName: "list_bookings", startedAt, success: false, errorMessage: "not_authenticated" });
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
    let q = supabase
      .from("bookings")
      .select(
        "id, check_in, check_out, state, total_price, num_guests, unit_id, guest_id, created_at",
      )
      .order("check_in", { ascending: false })
      .limit(limit ?? 20);
    if (state) q = q.eq("state", state);
    const { data, error } = await q;
    if (error) {
      await logMcpActivity({ ctx, toolName: "list_bookings", startedAt, success: false, errorMessage: error.message, inputSummary: { state, limit } });
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    await logMcpActivity({ ctx, toolName: "list_bookings", startedAt, success: true, rowCount: data?.length ?? 0, inputSummary: { state, limit } });
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { bookings: data ?? [] },
    };
  },
});
