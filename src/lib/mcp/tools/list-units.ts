import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { logMcpActivity } from "../log";

export default defineTool({
  name: "list_units",
  title: "List units",
  description: "List property units (rooms/accommodations) visible to the signed-in user.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input: unknown, ctx: ToolContext) => {
    const startedAt = Date.now();
    if (!ctx.isAuthenticated()) {
      await logMcpActivity({ ctx, toolName: "list_units", startedAt, success: false, errorMessage: "not_authenticated" });
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
    const { data, error } = await supabase
      .from("units")
      .select("id, name, unit_type, capacity, base_price, is_active")
      .order("name", { ascending: true });
    if (error) {
      await logMcpActivity({ ctx, toolName: "list_units", startedAt, success: false, errorMessage: error.message });
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    await logMcpActivity({ ctx, toolName: "list_units", startedAt, success: true, rowCount: data?.length ?? 0 });
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { units: data ?? [] },
    };
  },
});
