
CREATE TABLE public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  function_name text NOT NULL,
  mode text,
  actor_id uuid,
  actor_role text,
  property_id uuid,
  channel text,
  status text NOT NULL DEFAULT 'ok',
  model text,
  tokens_in integer DEFAULT 0,
  tokens_out integer DEFAULT 0,
  latency_ms integer,
  cost_estimate_micro_usd bigint DEFAULT 0,
  request_hash text,
  ip_hash text,
  error_code text
);

CREATE INDEX ai_usage_actor_idx    ON public.ai_usage_events (actor_id, created_at DESC);
CREATE INDEX ai_usage_property_idx ON public.ai_usage_events (property_id, created_at DESC);
CREATE INDEX ai_usage_fn_idx       ON public.ai_usage_events (function_name, created_at DESC);
CREATE INDEX ai_usage_created_idx  ON public.ai_usage_events (created_at DESC);

GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL    ON public.ai_usage_events TO service_role;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins see all AI usage"
  ON public.ai_usage_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers see property-scoped AI usage"
  ON public.ai_usage_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager')
    AND property_id IS NOT NULL
    AND public.has_property_access(auth.uid(), property_id)
  );

CREATE TABLE public.ai_model_costs (
  model text PRIMARY KEY,
  input_micro_usd_per_1k bigint NOT NULL DEFAULT 0,
  output_micro_usd_per_1k bigint NOT NULL DEFAULT 0,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_model_costs TO authenticated;
GRANT ALL    ON public.ai_model_costs TO service_role;
ALTER TABLE public.ai_model_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read model costs"
  ON public.ai_model_costs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage model costs"
  ON public.ai_model_costs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.ai_model_costs (model, input_micro_usd_per_1k, output_micro_usd_per_1k, notes) VALUES
  ('google/gemini-2.5-flash',       75,   300,  'default chat/translate'),
  ('google/gemini-2.5-flash-lite',  38,   150,  'cheap classification'),
  ('google/gemini-2.5-pro',         1250, 5000, 'heavy reasoning'),
  ('google/gemini-3-flash-preview', 75,   300,  'preview default'),
  ('openai/gpt-5-mini',             250,  2000, 'fallback'),
  ('openai/gpt-5',                  1250, 10000,'premium')
ON CONFLICT (model) DO NOTHING;

-- Seed AI governance policy keys (skip existing via NOT EXISTS — composite unique uses an expression)
INSERT INTO public.policy_settings (key, value)
SELECT k, v::jsonb FROM (VALUES
  ('ai_translate_enabled',            'true'),
  ('ai_verify_document_enabled',      'true'),
  ('ai_messaging_enabled',            'true'),
  ('ai_drafts_enabled',               'true'),
  ('ai_user_daily_limit_guest',       '60'),
  ('ai_user_daily_limit_staff',       '300'),
  ('ai_user_daily_limit_manager',     '1000'),
  ('ai_translate_daily_limit_guest',  '120'),
  ('ai_translate_daily_limit_staff',  '400'),
  ('ai_verify_doc_daily_limit_guest', '10'),
  ('ai_verify_doc_daily_limit_staff', '60'),
  ('ai_property_daily_limit',         '5000'),
  ('ai_property_monthly_budget_usd',  '100'),
  ('ai_alert_threshold_pct',          '75'),
  ('ai_max_translate_chars',          '4000'),
  ('ai_max_document_bytes',           '10485760')
) AS s(k, v)
WHERE NOT EXISTS (
  SELECT 1 FROM public.policy_settings ps
  WHERE ps.key = s.k AND ps.property_id IS NULL
);
