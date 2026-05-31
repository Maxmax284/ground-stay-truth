
REVOKE EXECUTE ON FUNCTION public.increment_payment_link_attempt(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lock_payment_link_abuse(uuid, text) FROM public, anon, authenticated;
