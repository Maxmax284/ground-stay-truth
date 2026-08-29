REVOKE EXECUTE ON FUNCTION public.trg_audit_staff_booking_created() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_audit_staff_booking_created() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_audit_staff_booking_created() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.trg_audit_staff_booking_created() TO service_role;