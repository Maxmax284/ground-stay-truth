REVOKE ALL ON FUNCTION public.can_record_offline_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_record_offline_payment(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_read_payments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_payments(uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.record_offline_payment(uuid, numeric, text, text, text, text) TO service_role;
