
-- Extend email_log with observability fields (Task 2, Task 5)
ALTER TABLE public.email_log
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS provider_response JSONB,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correlation_id UUID,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS failure_category TEXT;

-- Indexes for Operations Monitor grouping (Task 4)
CREATE INDEX IF NOT EXISTS email_log_status_sent_at_idx
  ON public.email_log (status, sent_at DESC);
CREATE INDEX IF NOT EXISTS email_log_correlation_idx
  ON public.email_log (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_log_grouping_idx
  ON public.email_log (template_key, recipient_email, failure_category, sent_at DESC)
  WHERE status = 'failed';

-- Grouped failure view for the Operations Monitor (Task 4)
-- Groups identical failures within a 30-min rolling window.
CREATE OR REPLACE VIEW public.email_failure_groups
WITH (security_invoker = true)
AS
SELECT
  template_key,
  recipient_email,
  COALESCE(failure_category, 'unknown') AS failure_category,
  COALESCE(failure_reason, error_message, 'unknown') AS reason,
  count(*)::int AS occurrence_count,
  max(sent_at) AS last_failed_at,
  min(sent_at) AS first_failed_at,
  max(retry_count) AS max_retries,
  (array_agg(id ORDER BY sent_at DESC))[1] AS latest_id,
  (array_agg(booking_id ORDER BY sent_at DESC) FILTER (WHERE booking_id IS NOT NULL))[1] AS booking_id,
  (array_agg(correlation_id ORDER BY sent_at DESC) FILTER (WHERE correlation_id IS NOT NULL))[1] AS correlation_id
FROM public.email_log
WHERE status IN ('failed','no_provider')
  AND sent_at > now() - interval '7 days'
GROUP BY template_key, recipient_email, failure_category,
         COALESCE(failure_reason, error_message, 'unknown');

GRANT SELECT ON public.email_failure_groups TO authenticated;
