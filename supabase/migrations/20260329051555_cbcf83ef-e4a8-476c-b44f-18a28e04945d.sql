-- Security events audit table for Fenrir Lock integration
CREATE TABLE public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'low',
  actor_id uuid,
  actor_role text,
  actor_email text,
  confidence_score integer DEFAULT 50,
  details jsonb DEFAULT '{}'::jsonb,
  source_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: only admins can read security events
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read security events"
  ON public.security_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service can insert security events"
  ON public.security_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Index for querying by event_type and time
CREATE INDEX idx_security_events_type_created ON public.security_events (event_type, created_at DESC);

-- Insert Fenrir policy settings defaults
INSERT INTO public.policy_settings (key, value, description) VALUES
  ('fenrir_enabled', '"false"', 'Enable Fenrir Lock security telemetry'),
  ('fenrir_endpoint', '""', 'Fenrir Lock ingestion endpoint URL'),
  ('security_freeze_active', '"false"', 'Emergency security freeze — locks down non-essential operations'),
  ('security_threat_level', '"normal"', 'Current threat level (normal, elevated, high, critical)')
ON CONFLICT DO NOTHING;