import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { logMcpActivity } from "../log";

export default defineTool({
  name: "get_exceptions",
  title: "Get operational exceptions",
  description:
    "Return the current operational exceptions (missing drivers, unpaid deposits near arrival, TM30 gaps, etc). Admin-only — the underlying RPC rejects non-admin callers.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input: unknown, ctx: ToolContext) => {
    const startedAt = Date.now();
    if (!ctx.isAuthenticated()) {
      await logMcpActivity({ ctx, toolName: "get_exceptions", startedAt, success: false, errorMessage: "not_authenticated" });
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
    const { data, error } = await supabase.rpc("get_ops_exceptions");
    if (error) {
      await logMcpActivity({ ctx, toolName: "get_exceptions", startedAt, success: false, errorMessage: error.message });
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    await logMcpActivity({ ctx, toolName: "get_exceptions", startedAt, success: true, rowCount: data?.length ?? 0 });
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { exceptions: data ?? [] },
    };
  },
});
