REVOKE EXECUTE ON FUNCTION public.device_self_approval_allowed() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.device_self_approval_allowed() TO authenticated, service_role;