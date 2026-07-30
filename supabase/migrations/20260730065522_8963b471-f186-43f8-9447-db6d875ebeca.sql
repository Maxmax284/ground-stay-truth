ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS standalone boolean,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.push_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  endpoint_tail text,
  title text,
  status text NOT NULL,
  http_status integer,
  error text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.push_delivery_log TO authenticated;
GRANT ALL ON public.push_delivery_log TO service_role;
ALTER TABLE public.push_delivery_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view push delivery log" ON public.push_delivery_log;
CREATE POLICY "Staff can view push delivery log"
ON public.push_delivery_log FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'front_desk_supervisor')
  OR user_id = auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_push_delivery_log_created_at ON public.push_delivery_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_delivery_log_user ON public.push_delivery_log (user_id, created_at DESC);