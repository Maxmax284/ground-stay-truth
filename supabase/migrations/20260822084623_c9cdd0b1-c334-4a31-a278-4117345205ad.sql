REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_property_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_property_access(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.tag_override_elevation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tag_override_elevation() TO service_role;
