-- ── Admin break-glass elevation ────────────────────────────────────────────
CREATE TABLE public.admin_elevation_grants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subject_user_id uuid NOT NULL,
  granted_by_user_id uuid NOT NULL,
  self_issued boolean NOT NULL DEFAULT false,
  reason text NOT NULL,
  minutes integer NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by_user_id uuid,
  used_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_elevation_minutes_check CHECK (minutes >= 1 AND minutes <= 15),
  CONSTRAINT admin_elevation_reason_check CHECK (length(btrim(reason)) >= 5)
);

CREATE INDEX idx_elevation_subject_active
  ON public.admin_elevation_grants (subject_user_id, expires_at DESC);
CREATE INDEX idx_elevation_created
  ON public.admin_elevation_grants (created_at DESC);

GRANT SELECT ON public.admin_elevation_grants TO authenticated;
GRANT ALL ON public.admin_elevation_grants TO service_role;

ALTER TABLE public.admin_elevation_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all elevation grants"
ON public.admin_elevation_grants FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read their own elevation grants"
ON public.admin_elevation_grants FOR SELECT TO authenticated
USING (subject_user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies: writes go exclusively through the
-- SECURITY DEFINER functions below so the audit trail cannot be bypassed.

-- ── Is a user currently elevated? ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_active_elevation(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_elevation_grants
    WHERE subject_user_id = _user_id
      AND revoked_at IS NULL
      AND expires_at > now()
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_elevation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_elevation(uuid) TO authenticated, anon, service_role;

-- ── Current active grant for the caller ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_active_elevation()
RETURNS TABLE (
  id uuid,
  reason text,
  minutes integer,
  expires_at timestamptz,
  self_issued boolean,
  granted_by_user_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id, g.reason, g.minutes, g.expires_at, g.self_issued, g.granted_by_user_id
  FROM public.admin_elevation_grants g
  WHERE g.subject_user_id = auth.uid()
    AND g.revoked_at IS NULL
    AND g.expires_at > now()
  ORDER BY g.expires_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.my_active_elevation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_active_elevation() TO authenticated, service_role;

-- ── Grant an elevation (admin only; self or another staff member) ───────────
CREATE OR REPLACE FUNCTION public.grant_admin_elevation(
  _subject_user_id uuid,
  _reason text,
  _minutes integer DEFAULT 15
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required';
  END IF;

  -- Revoke any existing live grant for this subject so there is exactly one.
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
GRANT EXECUTE ON FUNCTION public.grant_admin_elevation(uuid, text, integer) TO authenticated;

-- ── Revoke early (admin, or the subject giving up their own window) ─────────
CREATE OR REPLACE FUNCTION public.revoke_admin_elevation(_grant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _subject uuid;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT subject_user_id INTO _subject
  FROM public.admin_elevation_grants
  WHERE id = _grant_id AND revoked_at IS NULL;

  IF _subject IS NULL THEN
    RETURN false;
  END IF;

  IF NOT (public.has_role(_caller, 'admin') OR _subject = _caller) THEN
    RAISE EXCEPTION 'Not allowed to revoke this elevation';
  END IF;

  UPDATE public.admin_elevation_grants
  SET revoked_at = now(), revoked_by_user_id = _caller
  WHERE id = _grant_id;

  PERFORM public.log_override_event(
    'admin_elevation_revoked', 'admin_elevation', _grant_id, NULL, NULL,
    '{}'::jsonb,
    jsonb_build_object('subject_user_id', _subject, 'revoked_by', _caller),
    'Elevation window closed', NULL, '{}'::jsonb
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_admin_elevation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_admin_elevation(uuid) TO authenticated;

-- ── Tag every audited action taken during an elevation window ──────────────
ALTER TABLE public.override_audit_log
  ADD COLUMN IF NOT EXISTS elevated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS elevation_grant_id uuid;

CREATE INDEX IF NOT EXISTS idx_override_audit_elevated
  ON public.override_audit_log (created_at DESC) WHERE elevated;

CREATE OR REPLACE FUNCTION public.tag_override_elevation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grant record;
BEGIN
  IF NEW.actor_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _grant
  FROM public.admin_elevation_grants
  WHERE subject_user_id = NEW.actor_user_id
    AND revoked_at IS NULL
    AND expires_at > now()
  ORDER BY expires_at DESC
  LIMIT 1;

  IF _grant.id IS NOT NULL THEN
    NEW.elevated := true;
    NEW.elevation_grant_id := _grant.id;
    UPDATE public.admin_elevation_grants
    SET used_count = used_count + 1
    WHERE id = _grant.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tag_override_elevation ON public.override_audit_log;
CREATE TRIGGER trg_tag_override_elevation
BEFORE INSERT ON public.override_audit_log
FOR EACH ROW EXECUTE FUNCTION public.tag_override_elevation();