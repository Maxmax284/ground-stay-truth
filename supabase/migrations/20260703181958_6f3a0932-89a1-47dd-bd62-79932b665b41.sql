CREATE TABLE public.mcp_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  client_name TEXT,
  client_id TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  row_count INTEGER,
  duration_ms INTEGER,
  input_summary JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_activity_created_at ON public.mcp_activity (created_at DESC);
CREATE INDEX idx_mcp_activity_user_id ON public.mcp_activity (user_id);
CREATE INDEX idx_mcp_activity_tool_name ON public.mcp_activity (tool_name);

GRANT SELECT ON public.mcp_activity TO authenticated;
GRANT ALL ON public.mcp_activity TO service_role;

ALTER TABLE public.mcp_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all MCP activity"
  ON public.mcp_activity
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages MCP activity"
  ON public.mcp_activity
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);