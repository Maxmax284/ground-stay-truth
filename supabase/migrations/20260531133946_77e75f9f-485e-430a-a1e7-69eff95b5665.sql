
CREATE TABLE public.recovery_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  notes TEXT,
  kind TEXT NOT NULL DEFAULT 'manual',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  table_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_snapshots TO authenticated;
GRANT ALL ON public.recovery_snapshots TO service_role;

ALTER TABLE public.recovery_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view recovery snapshots"
  ON public.recovery_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert recovery snapshots"
  ON public.recovery_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete recovery snapshots"
  ON public.recovery_snapshots FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_recovery_snapshots_created_at ON public.recovery_snapshots (created_at DESC);

-- Capture function: captures config-only tables (no guest PII, no payments)
CREATE OR REPLACE FUNCTION public.create_recovery_snapshot(_label TEXT, _notes TEXT DEFAULT NULL, _kind TEXT DEFAULT 'manual')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor UUID := auth.uid();
  _email TEXT;
  _payload JSONB;
  _counts JSONB;
  _id UUID;
BEGIN
  IF NOT public.has_role(_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can create recovery snapshots';
  END IF;

  SELECT email INTO _email FROM public.profiles WHERE user_id = _actor;

  _payload := jsonb_build_object(
    'policy_settings', COALESCE((SELECT jsonb_agg(to_jsonb(ps)) FROM public.policy_settings ps), '[]'::jsonb),
    'pricing_rules',   COALESCE((SELECT jsonb_agg(to_jsonb(pr)) FROM public.pricing_rules pr), '[]'::jsonb),
    'properties',      COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM public.properties p), '[]'::jsonb),
    'units',           COALESCE((SELECT jsonb_agg(to_jsonb(u)) FROM public.units u), '[]'::jsonb),
    'user_roles',      COALESCE((SELECT jsonb_agg(to_jsonb(ur)) FROM public.user_roles ur), '[]'::jsonb)
  );

  _counts := jsonb_build_object(
    'policy_settings', (SELECT count(*) FROM public.policy_settings),
    'pricing_rules',   (SELECT count(*) FROM public.pricing_rules),
    'properties',      (SELECT count(*) FROM public.properties),
    'units',           (SELECT count(*) FROM public.units),
    'user_roles',      (SELECT count(*) FROM public.user_roles)
  );

  INSERT INTO public.recovery_snapshots
    (label, notes, kind, payload, table_counts, size_bytes, created_by, created_by_email)
  VALUES
    (_label, _notes, COALESCE(_kind, 'manual'), _payload, _counts,
     octet_length(_payload::text), _actor, _email)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_recovery_snapshot(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_recovery_snapshot(TEXT, TEXT, TEXT) TO authenticated;
