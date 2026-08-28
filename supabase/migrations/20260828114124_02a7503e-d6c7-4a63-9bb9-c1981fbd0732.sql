DO $$
DECLARE
  _booking_id uuid := 'e92192b6-16e7-4a68-a2f7-454275165c3d';
  _link_id uuid := '85afc9c7-23ce-4e99-9b31-95bea7a60782';
  _old_amount numeric;
  _new_amount numeric;
BEGIN
  SELECT amount INTO _old_amount
  FROM public.payment_links
  WHERE id = _link_id
    AND booking_id = _booking_id
    AND used_at IS NULL
    AND revoked_at IS NULL
  FOR UPDATE;

  IF _old_amount IS NULL THEN
    RAISE EXCEPTION 'Target payment link is no longer open; no correction applied';
  END IF;

  SELECT round(
    greatest(
      0,
      coalesce(b.total_price, 0)
      + coalesce((
          SELECT sum(p.amount)
          FROM public.payments p
          WHERE p.booking_id = b.id
            AND coalesce(p.payment_type, '') = 'addon'
            AND lower(p.status) IN ('pending', 'recorded', 'partially_refunded', 'waived')
        ), 0)
      - coalesce((
          SELECT sum(p.amount)
          FROM public.payments p
          WHERE p.booking_id = b.id
            AND lower(p.status) IN ('recorded', 'partially_refunded', 'completed')
            AND coalesce(p.payment_type, '') <> 'security_deposit'
        ), 0)
      + coalesce((
          SELECT sum(coalesce(p.refund_amount, 0))
          FROM public.payments p
          WHERE p.booking_id = b.id
            AND lower(p.status) IN ('refunded', 'partially_refunded')
        ), 0)
    ),
    2
  ) INTO _new_amount
  FROM public.bookings b
  WHERE b.id = _booking_id;

  IF _new_amount IS NULL OR _new_amount <= 0 THEN
    RAISE EXCEPTION 'Booking has no outstanding balance; no correction applied';
  END IF;

  UPDATE public.payment_links
  SET amount = _new_amount,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'reconciled_from_amount', _old_amount,
        'reconciled_at', now(),
        'reconciliation_reason', 'modify_stay_link_used_delta_instead_of_live_outstanding'
      )
  WHERE id = _link_id;

  INSERT INTO public.payment_link_events (
    payment_link_id, booking_id, event_type, actor_role, context
  ) VALUES (
    _link_id,
    _booking_id,
    'amount_reconciled',
    'system',
    jsonb_build_object(
      'old_amount', _old_amount,
      'new_amount', _new_amount,
      'reason', 'modify_stay_link_used_delta_instead_of_live_outstanding'
    )
  );
END $$;