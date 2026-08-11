CREATE OR REPLACE FUNCTION public.assign_sandbox_to_caller()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _prop uuid;
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(_caller, 'admin') OR public.has_role(_caller, 'manager')) THEN
    RAISE EXCEPTION 'Only admins or managers can use the sandbox';
  END IF;

  SELECT id INTO _prop FROM public.properties WHERE slug = 'sandbox';
  IF _prop IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.user_property_assignments (user_id, property_id, is_default)
  SELECT _caller, _prop, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_property_assignments
    WHERE user_id = _caller AND property_id = _prop
  );

  RETURN _prop;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_sandbox_to_caller() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_sandbox_to_caller() TO authenticated, service_role;