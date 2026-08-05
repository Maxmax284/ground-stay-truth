CREATE TABLE public.override_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id uuid,
  actor_name text,
  actor_email text,
  actor_role text,
  action_type text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  booking_id uuid,
  room_id uuid,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  source text NOT NULL DEFAULT 'unknown',
  attribution_missing boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT override_audit_log_source_check CHECK (source = ANY (ARRAY['human_admin','staff_user','system','automation','unknown']))
);

CREATE INDEX idx_override_audit_created_at ON public.override_audit_log (created_at DESC);
CREATE INDEX idx_override_audit_booking ON public.override_audit_log (booking_id, created_at DESC);
CREATE INDEX idx_override_audit_target ON public.override_audit_log (target_type, target_id, created_at DESC);
CREATE INDEX idx_override_audit_missing ON public.override_audit_log (attribution_missing) WHERE attribution_missing;

GRANT SELECT ON public.override_audit_log TO authenticated;
GRANT ALL ON public.override_audit_log TO service_role;

ALTER TABLE public.override_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read override audit log"
ON public.override_audit_log FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'front_desk_supervisor')
  OR public.has_role(auth.uid(), 'front_desk')
);

CREATE POLICY "Admins can manage override audit log"
ON public.override_audit_log FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_override_event(
  _action_type text,
  _target_type text,
  _target_id uuid DEFAULT NULL,
  _booking_id uuid DEFAULT NULL,
  _room_id uuid DEFAULT NULL,
  _before_state jsonb DEFAULT '{}'::jsonb,
  _after_state jsonb DEFAULT '{}'::jsonb,
  _reason text DEFAULT NULL,
  _source text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _name text;
  _email text;
  _role text;
  _src text;
  _missing boolean := false;
  _id uuid;
BEGIN
  IF _uid IS NOT NULL THEN
    SELECT p.full_name, p.email INTO _name, _email
    FROM public.profiles p WHERE p.user_id = _uid;

    SELECT ur.role::text INTO _role
    FROM public.user_roles ur
    WHERE ur.user_id = _uid
    ORDER BY CASE ur.role
      WHEN 'admin' THEN 1
      WHEN 'manager' THEN 2
      WHEN 'front_desk_supervisor' THEN 3
      WHEN 'front_desk' THEN 4
      WHEN 'maintenance' THEN 5
      WHEN 'viewer' THEN 6
      ELSE 7 END
    LIMIT 1;
  END IF;

  IF _source IN ('system','automation') THEN
    _src := _source;
  ELSIF _uid IS NULL THEN
    _src := 'unknown';
    _missing := true;
  ELSIF _role = 'admin' THEN
    _src := 'human_admin';
  ELSE
    _src := 'staff_user';
  END IF;

  IF _uid IS NULL AND _src NOT IN ('system','automation') THEN
    _name := 'Unknown user';
  END IF;

  INSERT INTO public.override_audit_log (
    actor_user_id, actor_name, actor_email, actor_role,
    action_type, target_type, target_id, booking_id, room_id,
    before_state, after_state, reason, source, attribution_missing, metadata
  ) VALUES (
    _uid, _name, _email, _role,
    _action_type, _target_type, _target_id, _booking_id, _room_id,
    COALESCE(_before_state, '{}'::jsonb), COALESCE(_after_state, '{}'::jsonb),
    _reason, _src, _missing, COALESCE(_metadata, '{}'::jsonb)
  ) RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_override_event(text,text,uuid,uuid,uuid,jsonb,jsonb,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_override_event(text,text,uuid,uuid,uuid,jsonb,jsonb,text,text,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.count_overrides_missing_attribution()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.override_audit_log WHERE attribution_missing;
$$;

REVOKE ALL ON FUNCTION public.count_overrides_missing_attribution() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_overrides_missing_attribution() TO authenticated, service_role;