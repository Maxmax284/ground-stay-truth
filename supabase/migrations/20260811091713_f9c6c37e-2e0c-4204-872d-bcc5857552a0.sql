CREATE OR REPLACE FUNCTION public.is_manual_offline_payment_row(
  _method text, _provider text, _provider_transaction_id text,
  _provider_session_id text, _provider_status text, _status text,
  _source_channel text, _receipt_url text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.is_offline_payment_method(_method)
     AND lower(coalesce(_provider, '')) = 'manual'
     AND _provider_transaction_id IS NULL
     AND _provider_session_id IS NULL
     AND _receipt_url IS NULL
     AND lower(coalesce(_provider_status, '')) IN ('completed', 'manual')
     AND lower(coalesce(_status, '')) IN ('recorded', 'completed')
     AND lower(coalesce(_source_channel, '')) IN ('front_desk', 'staff_offline', 'supervisor_override')
$$;

CREATE OR REPLACE FUNCTION public.record_offline_payment(
  _booking_id uuid,
  _amount numeric,
  _method text,
  _payment_type text DEFAULT 'balance',
  _notes text DEFAULT NULL,
  _recovery_note text DEFAULT NULL,
  _source_channel text DEFAULT 'front_desk'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _booking public.bookings;
  _payment_id uuid;
  _old_paid numeric;
  _new_paid numeric;
  _actor_role text;
  _channel text := lower(coalesce(_source_channel, 'front_desk'));
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF NOT public.can_record_offline_payment(_actor) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_TO_RECORD_PAYMENT';
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  IF NOT public.is_offline_payment_method(_method) THEN
    RAISE EXCEPTION 'METHOD_NOT_OFFLINE';
  END IF;

  IF _channel NOT IN ('front_desk', 'staff_offline', 'supervisor_override') THEN
    RAISE EXCEPTION 'INVALID_SOURCE_CHANNEL';
  END IF;

  SELECT * INTO _booking FROM public.bookings WHERE id = _booking_id;
  IF _booking.id IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  IF NOT public.has_property_access(_actor, _booking.property_id) THEN
    RAISE EXCEPTION 'BOOKING_OUTSIDE_PROPERTY_SCOPE';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO _old_paid
  FROM public.payments
  WHERE booking_id = _booking_id AND lower(status) IN ('recorded', 'completed');

  INSERT INTO public.payments (
    booking_id, amount, method, status, recorded_by, notes,
    source_channel, provider, provider_status, payment_type
  ) VALUES (
    _booking_id, _amount, lower(_method), 'recorded', _actor, _notes,
    _channel, 'manual', 'completed', coalesce(_payment_type, 'balance')
  )
  RETURNING id INTO _payment_id;

  _new_paid := _old_paid + _amount;

  SELECT role::text INTO _actor_role FROM public.user_roles
  WHERE user_id = _actor
  ORDER BY CASE role::text
    WHEN 'admin' THEN 1 WHEN 'manager' THEN 2
    WHEN 'front_desk_supervisor' THEN 3 ELSE 4 END
  LIMIT 1;

  PERFORM public.log_override_event(
    'manual_payment_recorded', 'payment', _payment_id, _booking_id, _booking.unit_id,
    jsonb_build_object('total_paid', _old_paid, 'outstanding', _booking.total_price - _old_paid),
    jsonb_build_object(
      'total_paid', _new_paid,
      'outstanding', _booking.total_price - _new_paid,
      'amount', _amount, 'currency', 'THB',
      'method', lower(_method), 'payment_type', coalesce(_payment_type, 'balance'),
      'source_channel', _channel,
      'actor_role', _actor_role, 'notes', _notes,
      'recovered_after_rls_failure', (_recovery_note IS NOT NULL),
      'recorded_at_bangkok', to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI')
    ),
    coalesce(_recovery_note, _notes),
    'staff_record_offline_payment',
    jsonb_build_object('offline', true, 'source_channel', _channel)
  );

  RETURN _payment_id;
END;
$$;

DROP FUNCTION IF EXISTS public.record_offline_payment(uuid, numeric, text, text, text, text);

REVOKE ALL ON FUNCTION public.record_offline_payment(uuid, numeric, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_offline_payment(uuid, numeric, text, text, text, text, text) TO authenticated, service_role;
