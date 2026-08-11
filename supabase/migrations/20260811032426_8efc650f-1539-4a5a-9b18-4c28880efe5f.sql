CREATE TABLE public.ops_passcode (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  salt text NOT NULL,
  hash text NOT NULL,
  iterations integer NOT NULL DEFAULT 120000,
  updated_by_user_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ops_passcode TO service_role;
ALTER TABLE public.ops_passcode ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ops_unlock_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX ops_unlock_sessions_active_idx ON public.ops_unlock_sessions (user_id, expires_at DESC) WHERE revoked_at IS NULL;
GRANT SELECT ON public.ops_unlock_sessions TO authenticated;
GRANT ALL ON public.ops_unlock_sessions TO service_role;
ALTER TABLE public.ops_unlock_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see their own unlock sessions"
  ON public.ops_unlock_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE public.ops_unlock_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  succeeded boolean NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ops_unlock_attempts_user_idx ON public.ops_unlock_attempts (user_id, created_at DESC);
GRANT SELECT ON public.ops_unlock_attempts TO authenticated;
GRANT ALL ON public.ops_unlock_attempts TO service_role;
ALTER TABLE public.ops_unlock_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read unlock attempts"
  ON public.ops_unlock_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.is_ops_passcode_set()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.ops_passcode WHERE id);
$$;
REVOKE ALL ON FUNCTION public.is_ops_passcode_set() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ops_passcode_set() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_ops_unlock(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.ops_passcode WHERE id) THEN true
    WHEN _user_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.ops_unlock_sessions s
      WHERE s.user_id = _user_id
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
    )
  END;
$$;
REVOKE ALL ON FUNCTION public.has_ops_unlock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_ops_unlock(uuid) TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "Ops staff review AI drafts" ON public.ai_action_drafts;
CREATE POLICY "Ops staff review AI drafts"
  ON public.ai_action_drafts FOR UPDATE TO authenticated
  USING (public.has_ops_write(auth.uid()) AND public.has_ops_unlock(auth.uid()))
  WITH CHECK (public.has_ops_write(auth.uid()) AND public.has_ops_unlock(auth.uid()));

DROP FUNCTION IF EXISTS public.grant_admin_elevation(uuid, text, integer);
CREATE FUNCTION public.grant_admin_elevation(
  _subject_user_id uuid DEFAULT NULL,
  _reason text DEFAULT NULL,
  _minutes integer DEFAULT 15
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
  _clamped integer := LEAST(GREATEST(COALESCE(_minutes, 15), 1), 15);
  _target uuid := COALESCE(_subject_user_id, _caller);
  _id uuid;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'Only admins can issue elevation grants';
  END IF;
  IF NOT public.has_ops_unlock(_caller) THEN
    RAISE EXCEPTION 'Ops passcode required before issuing elevation grants';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required';
  END IF;

  UPDATE public.admin_elevation_grants
  SET revoked_at = now(), revoked_by_user_id = _caller
  WHERE subject_user_id = _target AND revoked_at IS NULL AND expires_at > now();

  INSERT INTO public.admin_elevation_grants (
    subject_user_id, granted_by_user_id, self_issued, reason, minutes, expires_at
  ) VALUES (
    _target, _caller, _target = _caller, btrim(_reason), _clamped,
    now() + make_interval(mins => _clamped)
  )
  RETURNING id INTO _id;

  PERFORM public.log_override_event(
    'admin_elevation_granted', 'admin_elevation', _id, NULL, NULL,
    '{}'::jsonb,
    jsonb_build_object(
      'subject_user_id', _target,
      'minutes', _clamped,
      'self_issued', _target = _caller
    ),
    btrim(_reason), NULL,
    jsonb_build_object('expires_at', now() + make_interval(mins => _clamped))
  );

  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.grant_admin_elevation(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_admin_elevation(uuid, text, integer) TO authenticated, service_role;