-- Hardening: revoke EXECUTE on the new security-definer RPCs from anon/public.
-- These should only be callable by service_role (edge functions) or authenticated admins.

REVOKE EXECUTE ON FUNCTION public.increment_payment_link_attempt(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.lock_payment_link_abuse(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_payment_link_attempt(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_payment_link_abuse(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_recovery_snapshot(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_recovery_snapshot(text, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.log_staff_audit_event(text, text, uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_staff_audit_event(text, text, uuid, uuid, text, jsonb) TO authenticated, service_role;