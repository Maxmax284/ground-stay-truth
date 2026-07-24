
REVOKE EXECUTE ON FUNCTION public.emit_admin_alert(text, text, uuid, text, jsonb) FROM authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.emit_admin_alert(text, text, uuid, text, jsonb) TO service_role;
