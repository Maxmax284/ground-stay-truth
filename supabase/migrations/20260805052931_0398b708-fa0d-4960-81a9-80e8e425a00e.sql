DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, PUBLIC', r.sig);
  END LOOP;
END $$;