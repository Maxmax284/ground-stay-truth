-- 1. Staff security audit events
CREATE TABLE public.staff_audit_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','low','medium','high','critical')),
  actor_id UUID,
  actor_email TEXT,
  actor_role TEXT,
  target_user_id UUID,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_audit_events_created_at ON public.staff_audit_events (created_at DESC);
CREATE INDEX idx_staff_audit_events_actor ON public.staff_audit_events (actor_id, created_at DESC);
CREATE INDEX idx_staff_audit_events_type ON public.staff_audit_events (event_type, created_at DESC);
CREATE INDEX idx_staff_audit_events_severity ON public.staff_audit_events (severity, created_at DESC);

GRANT SELECT, INSERT ON public.staff_audit_events TO authenticated;
GRANT ALL ON public.staff_audit_events TO service_role;

ALTER TABLE public.staff_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all staff audit events"
  ON public.staff_audit_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff read own audit events"
  ON public.staff_audit_events FOR SELECT TO authenticated
  USING (actor_id = auth.uid() OR target_user_id = auth.uid());

CREATE POLICY "Authenticated staff can append audit events about themselves"
  ON public.staff_audit_events FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- 2. Server-side audit logger
CREATE OR REPLACE FUNCTION public.log_staff_audit_event(
  _event_type TEXT,
  _severity TEXT,
  _actor_id UUID,
  _target_user_id UUID DEFAULT NULL,
  _reason TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _email TEXT;
  _role TEXT;
BEGIN
  SELECT email INTO _email FROM public.profiles WHERE user_id = _actor_id;
  SELECT role::text INTO _role FROM public.user_roles WHERE user_id = _actor_id LIMIT 1;

  INSERT INTO public.staff_audit_events
    (event_type, severity, actor_id, actor_email, actor_role, target_user_id, reason, metadata)
  VALUES
    (_event_type, COALESCE(_severity, 'info'), _actor_id, _email, _role, _target_user_id, _reason, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- 3. MFA + session policy seeds (guarded against duplicates on global scope)
INSERT INTO public.policy_settings (key, value, description)
SELECT * FROM (VALUES
  ('mfa_required_admin', 'true'::jsonb, 'Require MFA enrollment for admin/owner accounts'),
  ('mfa_required_manager', 'true'::jsonb, 'Require MFA enrollment for manager accounts'),
  ('mfa_required_staff', 'false'::jsonb, 'Require MFA enrollment for all front-desk staff'),
  ('mfa_grace_period_days', '7'::jsonb, 'Days after which MFA enforcement blocks staff sign-in'),
  ('mfa_required_sensitive_actions', 'true'::jsonb, 'Require fresh MFA challenge before refunds, role/permission changes, and security setting changes'),
  ('session_admin_inactivity_minutes', '30'::jsonb, 'Auto-logout admins after this many minutes of inactivity'),
  ('session_staff_inactivity_minutes', '480'::jsonb, 'Auto-logout staff after this many minutes of inactivity')
) AS v(key, value, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.policy_settings ps
  WHERE ps.key = v.key AND ps.property_id IS NULL
);