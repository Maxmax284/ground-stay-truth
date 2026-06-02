REVOKE ALL ON FUNCTION public.emit_vanta_signal() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.emit_vanta_signal() FROM anon;
REVOKE ALL ON FUNCTION public.emit_vanta_signal() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.emit_vanta_signal() TO service_role;