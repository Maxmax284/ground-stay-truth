
INSERT INTO public.policy_settings (key, value, property_id, updated_by)
SELECT v.key, v.value::jsonb, NULL::uuid, NULL::uuid
FROM (VALUES
  ('ai_monthly_budget_micro_usd', '"50000000"'),
  ('ai_property_monthly_budget_micro_usd', '"20000000"'),
  ('ai_budget_alert_75_sent_month', '""'),
  ('ai_budget_alert_90_sent_month', '""'),
  ('ai_budget_alert_100_sent_month', '""'),
  ('ai_ip_hourly_limit', '"100"'),
  ('ai_dedup_window_seconds', '"60"'),
  ('ai_multi_account_ip_threshold', '"3"'),
  ('ai_pause_until', '""')
) AS v(key, value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.policy_settings ps
  WHERE ps.key = v.key AND ps.property_id IS NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_created_at ON public.ai_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_property_created ON public.ai_usage_events (property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_actor_created ON public.ai_usage_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_function_created ON public.ai_usage_events (function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_ip_created ON public.ai_usage_events (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_request_hash ON public.ai_usage_events (request_hash, created_at DESC) WHERE request_hash IS NOT NULL;
