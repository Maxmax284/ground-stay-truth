
CREATE TABLE public.vanta_integration_session (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform_key TEXT NOT NULL DEFAULT 'ground_truth_hub',
  platform_name TEXT NOT NULL DEFAULT 'Ground Truth Hub',
  environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
  vanta_webhook_url TEXT,
  source_id TEXT NOT NULL DEFAULT 'gth_main',
  enabled BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'needs_setup',
  shared_secret_configured BOOLEAN NOT NULL DEFAULT false,
  callback_mode TEXT NOT NULL DEFAULT 'none' CHECK (callback_mode IN ('none','read_only','approved_callbacks')),
  allowed_events JSONB NOT NULL DEFAULT '["integration.test"]'::jsonb,
  last_event_sent_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  failure_count INT NOT NULL DEFAULT 0,
  last_error_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT, INSERT, UPDATE ON public.vanta_integration_session TO authenticated;
GRANT ALL ON public.vanta_integration_session TO service_role;

ALTER TABLE public.vanta_integration_session ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage vanta integration session"
  ON public.vanta_integration_session
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_vanta_session_updated_at
  BEFORE UPDATE ON public.vanta_integration_session
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.vanta_integration_session (platform_key, platform_name, environment, source_id, allowed_events)
VALUES ('ground_truth_hub','Ground Truth Hub','sandbox','gth_main',
  '["booking.created","booking.state_changed","guest_message.received","guest_request.created","payment.received","payment.failed","integration.test"]'::jsonb);

CREATE TABLE public.vanta_event_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound_to_vanta',
  status TEXT NOT NULL DEFAULT 'queued',
  payload_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL UNIQUE,
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  vanta_response_code INT,
  error_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vanta_event_log TO authenticated;
GRANT ALL ON public.vanta_event_log TO service_role;

ALTER TABLE public.vanta_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read vanta event log"
  ON public.vanta_event_log
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_vanta_event_log_created_at ON public.vanta_event_log (created_at DESC);
CREATE INDEX idx_vanta_event_log_event_type ON public.vanta_event_log (event_type);
CREATE INDEX idx_vanta_event_log_status ON public.vanta_event_log (status);
