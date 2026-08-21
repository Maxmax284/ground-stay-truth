CREATE OR REPLACE FUNCTION public.record_offline_payment(_booking_id uuid, _amount numeric, _method text, _payment_type text DEFAULT 'balance'::text, _notes text DEFAULT NULL::text, _recovery_note text DEFAULT NULL::text, _source_channel text DEFAULT 'front_desk'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _booking public.bookings;
  _payment_id uuid;
  _old_paid numeric;
  _new_paid numeric;
  _outstanding numeric;
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

  -- Money already on the booking: settled rows only, net of refunds.
  SELECT coalesce(sum(amount), 0) - coalesce(sum(coalesce(refund_amount, 0)), 0)
    INTO _old_paid
  FROM public.payments
  WHERE booking_id = _booking_id AND lower(status) IN ('recorded', 'completed');

  _old_paid := greatest(_old_paid, 0);

  -- Server-side overpayment guard. A booking with no priced total has no
  -- computable ceiling, so it is left uncapped rather than blocked.
  IF _booking.total_price IS NOT NULL AND _booking.total_price > 0 THEN
    _outstanding := round(_booking.total_price - _old_paid, 2);
    IF _outstanding <= 0 THEN
      RAISE EXCEPTION 'BOOKING_ALREADY_SETTLED';
    END IF;
    -- 1 unit of tolerance absorbs rounding between the client and the ledger.
    IF round(_amount, 2) > _outstanding + 1 THEN
      RAISE EXCEPTION 'AMOUNT_EXCEEDS_OUTSTANDING: outstanding %', _outstanding;
    END IF;
  END IF;

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
$function$;