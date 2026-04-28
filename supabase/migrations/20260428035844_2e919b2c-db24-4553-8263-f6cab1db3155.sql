CREATE OR REPLACE FUNCTION public.increment_payment_event_retry(
  _provider_event_id text,
  _error text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.payment_events
  SET retry_count = retry_count + 1,
      last_retry_at = now(),
      last_error = _error
  WHERE provider_event_id = _provider_event_id;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_payment_event_retry(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_payment_event_retry(text, text) TO service_role;