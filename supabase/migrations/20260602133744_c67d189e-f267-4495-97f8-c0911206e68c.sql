ALTER TABLE public.vanta_integration_session
  ADD COLUMN IF NOT EXISTS last_response_code INT,
  ADD COLUMN IF NOT EXISTS last_response_snippet TEXT,
  ADD COLUMN IF NOT EXISTS last_event_id UUID;

-- Clear stale failure state for the existing row so the UI stops showing the old 403.
UPDATE public.vanta_integration_session
SET last_failure_at = NULL,
    last_error_summary = NULL,
    failure_count = 0,
    status = CASE WHEN enabled AND vanta_webhook_url IS NOT NULL THEN 'live' ELSE status END;