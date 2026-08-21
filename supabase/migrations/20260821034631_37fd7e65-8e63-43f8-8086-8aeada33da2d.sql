CREATE TABLE public.payment_rejection_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text,
  attempted_amount numeric NOT NULL,
  computed_outstanding numeric,
  tolerance numeric NOT NULL DEFAULT 1,
  reason_code text NOT NULL,
  message text,
  method text,
  source_channel text,
  origin text NOT NULL DEFAULT 'server',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_rejection_log TO authenticated;
GRANT ALL ON public.payment_rejection_log TO service_role;

ALTER TABLE public.payment_rejection_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payment reviewers can read rejected attempts"
ON public.payment_rejection_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'front_desk_supervisor')
);

CREATE INDEX idx_payment_rejection_log_created_at ON public.payment_rejection_log (created_at DESC);
CREATE INDEX idx_payment_rejection_log_booking ON public.payment_rejection_log (booking_id);

CREATE OR REPLACE FUNCTION public.log_offline_payment_rejection(
  _booking_id uuid,
  _amount numeric,
  _reason_code text,
  _message text DEFAULT NULL,
  _method text DEFAULT NULL,
  _source_channel text DEFAULT NULL,
  _origin text DEFAULT 'server'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _actor_role text;
  _total numeric;
  _paid numeric;
  _outstanding numeric;
  _id uuid;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT role::text INTO _actor_role FROM public.user_roles
  WHERE user_id = _actor
  ORDER BY CASE role::text
    WHEN 'admin' THEN 1 WHEN 'manager' THEN 2
    WHEN 'front_desk_supervisor' THEN 3 ELSE 4 END
  LIMIT 1;

  SELECT total_price INTO _total FROM public.bookings WHERE id = _booking_id;

  IF _total IS NOT NULL THEN
    SELECT greatest(coalesce(sum(amount), 0) - coalesce(sum(coalesce(refund_amount, 0)), 0), 0)
      INTO _paid
    FROM public.payments
    WHERE booking_id = _booking_id AND lower(status) IN ('recorded', 'completed');
    _outstanding := round(_total - coalesce(_paid, 0), 2);
  END IF;

  INSERT INTO public.payment_rejection_log (
    booking_id, actor_id, actor_role, attempted_amount, computed_outstanding,
    tolerance, reason_code, message, method, source_channel, origin
  ) VALUES (
    _booking_id, _actor, _actor_role, _amount, _outstanding,
    1, upper(coalesce(_reason_code, 'UNKNOWN')), left(coalesce(_message, ''), 500),
    lower(nullif(_method, '')), lower(nullif(_source_channel, '')),
    lower(coalesce(nullif(_origin, ''), 'server'))
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.log_offline_payment_rejection(uuid, numeric, text, text, text, text, text) TO authenticated;