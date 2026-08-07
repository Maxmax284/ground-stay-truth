CREATE OR REPLACE FUNCTION public.has_ops_read(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','manager','front_desk_supervisor','front_desk','viewer')
  )
$$;

CREATE OR REPLACE FUNCTION public.has_ops_write(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','manager','front_desk_supervisor','front_desk')
  )
$$;

REVOKE ALL ON FUNCTION public.has_ops_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_ops_write(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_ops_read(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_ops_write(uuid) TO authenticated, service_role;

DO $$
DECLARE
  p record;
  new_qual text;
  new_check text;
  read_fn  constant text := 'public.has_ops_read(auth.uid())';
  write_fn constant text := 'public.has_ops_write(auth.uid())';
  target   constant text := 'has_role(auth.uid(), ''front_desk''::app_role)';
  repl     text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%''front_desk''::app_role%'
  LOOP
    repl := CASE WHEN p.cmd = 'SELECT' THEN read_fn ELSE write_fn END;

    new_qual  := replace(coalesce(p.qual, ''), target, CASE WHEN p.cmd = 'SELECT' THEN read_fn ELSE repl END);
    new_check := replace(coalesce(p.with_check, ''), target, repl);

    IF p.qual IS NOT NULL AND p.with_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',
                     p.policyname, p.tablename, new_qual, new_check);
    ELSIF p.qual IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)',
                     p.policyname, p.tablename, new_qual);
    ELSIF p.with_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)',
                     p.policyname, p.tablename, new_check);
    END IF;
  END LOOP;
END
$$;