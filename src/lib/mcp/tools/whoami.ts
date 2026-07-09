import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { logMcpActivity } from "../log";

export default defineTool({
  name: "whoami",
  title: "Who am I",
  description: "Return the signed-in LMT CampStay user's id, email, and roles.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input: unknown, ctx: ToolContext) => {
    const startedAt = Date.now();
    if (!ctx.isAuthenticated()) {
      await logMcpActivity({ ctx, toolName: "whoami", startedAt, success: false, errorMessage: "not_authenticated" });
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
    const userId = ctx.getUserId();
    const { data: roles, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (error) {
      await logMcpActivity({ ctx, toolName: "whoami", startedAt, success: false, errorMessage: error.message });
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    const info = {
      user_id: userId,
      email: ctx.getUserEmail(),
      roles: (roles ?? []).map((r: any) => r.role),
    };
    await logMcpActivity({ ctx, toolName: "whoami", startedAt, success: true, rowCount: roles?.length ?? 0 });
    return {
      content: [{ type: "text", text: JSON.stringify(info) }],
      structuredContent: info,
    };
  },
});
