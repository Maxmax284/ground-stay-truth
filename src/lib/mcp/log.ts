import type { ToolContext } from "@lovable.dev/mcp-js";

/**
 * Best-effort logger for MCP tool invocations.
 * Writes to public.mcp_activity via the service role so browser RLS
 * on that table stays admin-read-only.
 *
 * Never throws — a logging failure must not surface to the calling agent.
 */
export async function logMcpActivity(params: {
  ctx: ToolContext;
  toolName: string;
  startedAt: number;
  success: boolean;
  errorMessage?: string | null;
  rowCount?: number | null;
  inputSummary?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const claims = params.ctx.getClaims?.() ?? {};
    const clientName =
      (claims as any)?.client_name ??
      (claims as any)?.name ??
      null;

    await admin.from("mcp_activity").insert({
      user_id: params.ctx.getUserId?.() ?? null,
      tool_name: params.toolName,
      client_name: clientName,
      client_id: params.ctx.getClientId?.() ?? null,
      success: params.success,
      error_message: params.errorMessage ?? null,
      row_count: params.rowCount ?? null,
      duration_ms: Math.max(0, Date.now() - params.startedAt),
      input_summary: params.inputSummary ?? {},
    });
  } catch {
    /* best-effort — never break the tool */
  }
}
