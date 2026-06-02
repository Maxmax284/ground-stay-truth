REVOKE ALL ON FUNCTION public.get_integration_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_integration_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_integration_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_integration_secret(text) TO service_role;