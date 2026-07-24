
ALTER TABLE public.messaging_notification_log
  ADD COLUMN IF NOT EXISTS error_category text,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correlation_id uuid,
  ADD COLUMN IF NOT EXISTS provider_response jsonb,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS severity text;

CREATE INDEX IF NOT EXISTS idx_msg_notif_log_channel_outcome_created
  ON public.messaging_notification_log (channel, outcome, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_msg_notif_log_correlation
  ON public.messaging_notification_log (correlation_id)
  WHERE correlation_id IS NOT NULL;
