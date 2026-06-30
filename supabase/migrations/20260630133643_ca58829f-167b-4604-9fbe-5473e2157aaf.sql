
-- =========================================================
-- get_ops_service_health: deterministic service probes
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_ops_service_health()
RETURNS TABLE(
  key text,
  label text,
  status text,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  source text,
  detail jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- Stripe webhook (uses webhook_health table)
  RETURN QUERY
  SELECT 'stripe_webhook'::text, 'Stripe Webhook'::text,
    CASE
      WHEN wh.status = 'failing' THEN 'broken'
      WHEN wh.last_success_at IS NULL THEN 'unknown'
      WHEN wh.last_success_at < _now - interval '24 hours' THEN 'warning'
      ELSE 'healthy'
    END,
    wh.last_success_at, wh.last_failure_at, wh.last_failure_reason,
    'webhook_health'::text,
    jsonb_build_object('provider','stripe','last_event_id', wh.last_event_id)
  FROM public.webhook_health wh WHERE wh.provider = 'stripe'
  UNION ALL SELECT 'stripe_webhook','Stripe Webhook','not_configured',NULL,NULL,
    'No webhook events received yet','webhook_health',
    jsonb_build_object('hint','Trigger a Stripe test event to populate webhook_health')
  WHERE NOT EXISTS (SELECT 1 FROM public.webhook_health WHERE provider='stripe');

  -- Payment link generation
  RETURN QUERY
  SELECT 'payment_links'::text, 'Payment Link Generation'::text,
    CASE
      WHEN MAX(created_at) IS NULL THEN 'unknown'
      WHEN MAX(created_at) < _now - interval '7 days' THEN 'warning'
      ELSE 'healthy'
    END,
    MAX(created_at), NULL::timestamptz, NULL::text,
    'payment_links'::text,
    jsonb_build_object('total_30d', COUNT(*) FILTER (WHERE created_at > _now - interval '30 days'))
  FROM public.payment_links;

  -- Email delivery (dedup latest by message_id)
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (message_id) status, created_at, error_message
    FROM public.email_send_log
    WHERE message_id IS NOT NULL
    ORDER BY message_id, created_at DESC
  )
  SELECT 'email'::text, 'Email Delivery'::text,
    CASE
      WHEN COUNT(*) = 0 THEN 'not_configured'
      WHEN MAX(created_at) FILTER (WHERE status IN ('sent')) IS NULL THEN 'warning'
      WHEN MAX(created_at) FILTER (WHERE status IN ('dlq','failed','bounced')) >
           MAX(created_at) FILTER (WHERE status = 'sent') THEN 'broken'
      ELSE 'healthy'
    END,
    MAX(created_at) FILTER (WHERE status = 'sent'),
    MAX(created_at) FILTER (WHERE status IN ('dlq','failed','bounced')),
    (SELECT error_message FROM latest WHERE status IN ('dlq','failed','bounced')
       ORDER BY created_at DESC LIMIT 1),
    'email_send_log'::text,
    jsonb_build_object(
      'sent_7d', COUNT(*) FILTER (WHERE status='sent' AND created_at > _now - interval '7 days'),
      'failed_7d', COUNT(*) FILTER (WHERE status IN ('dlq','failed','bounced') AND created_at > _now - interval '7 days')
    )
  FROM latest;

  -- Messaging (WhatsApp / LINE / Telegram / SMS)
  RETURN QUERY
  SELECT 'messaging'::text, 'Messaging Channels'::text,
    CASE
      WHEN COUNT(*) = 0 THEN 'not_configured'
      WHEN MAX(created_at) FILTER (WHERE status = 'delivered' OR status = 'sent') IS NULL THEN 'warning'
      WHEN MAX(created_at) FILTER (WHERE status IN ('failed','error')) >
           COALESCE(MAX(created_at) FILTER (WHERE status IN ('delivered','sent')), 'epoch'::timestamptz) THEN 'broken'
      ELSE 'healthy'
    END,
    MAX(created_at) FILTER (WHERE status IN ('delivered','sent')),
    MAX(created_at) FILTER (WHERE status IN ('failed','error')),
    NULL::text,
    'messaging_notification_log'::text,
    jsonb_build_object('total_7d', COUNT(*) FILTER (WHERE created_at > _now - interval '7 days'))
  FROM public.messaging_notification_log;

  -- Flight API
  RETURN QUERY
  SELECT 'flight_api'::text, 'Flight Tracking API'::text,
    CASE
      WHEN COUNT(*) = 0 THEN 'not_configured'
      WHEN MAX(last_checked_at) < _now - interval '6 hours' THEN 'warning'
      ELSE 'healthy'
    END,
    MAX(last_checked_at), NULL::timestamptz, NULL::text,
    'flight_tracking'::text,
    jsonb_build_object('rows', COUNT(*))
  FROM public.flight_tracking;

  -- Booking state machine activity
  RETURN QUERY
  SELECT 'booking_state'::text, 'Booking State Machine'::text,
    CASE
      WHEN MAX(changed_at) IS NULL THEN 'unknown'
      WHEN MAX(changed_at) < _now - interval '30 days' THEN 'warning'
      ELSE 'healthy'
    END,
    MAX(changed_at), NULL::timestamptz, NULL::text,
    'booking_state_log'::text,
    jsonb_build_object('transitions_7d', COUNT(*) FILTER (WHERE changed_at > _now - interval '7 days'))
  FROM public.booking_state_log;

  -- Notifications system
  RETURN QUERY
  SELECT 'notifications'::text, 'In-App Notifications'::text,
    CASE
      WHEN MAX(created_at) IS NULL THEN 'unknown'
      WHEN MAX(created_at) < _now - interval '7 days' THEN 'warning'
      ELSE 'healthy'
    END,
    MAX(created_at), NULL::timestamptz, NULL::text,
    'notifications'::text,
    jsonb_build_object('total_7d', COUNT(*) FILTER (WHERE created_at > _now - interval '7 days'))
  FROM public.notifications;

  -- Housekeeping turnover task creation
  RETURN QUERY
  SELECT 'housekeeping'::text, 'Housekeeping Turnover'::text,
    CASE
      WHEN MAX(created_at) IS NULL THEN 'unknown'
      ELSE 'healthy'
    END,
    MAX(created_at), NULL::timestamptz, NULL::text,
    'housekeeping_tasks'::text,
    jsonb_build_object('open', COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'completed'))
  FROM public.housekeeping_tasks;

  -- Audit log writes
  RETURN QUERY
  SELECT 'audit_log'::text, 'Audit Log Writes'::text,
    CASE
      WHEN MAX(created_at) IS NULL THEN 'unknown'
      WHEN MAX(created_at) < _now - interval '14 days' THEN 'warning'
      ELSE 'healthy'
    END,
    MAX(created_at), NULL::timestamptz, NULL::text,
    'staff_audit_events'::text,
    jsonb_build_object('events_7d', COUNT(*) FILTER (WHERE created_at > _now - interval '7 days'))
  FROM public.staff_audit_events;

  -- Document storage (guest_documents writes)
  RETURN QUERY
  SELECT 'documents'::text, 'Document Storage'::text,
    CASE
      WHEN MAX(created_at) IS NULL THEN 'not_configured'
      ELSE 'healthy'
    END,
    MAX(created_at), NULL::timestamptz, NULL::text,
    'guest_documents'::text,
    jsonb_build_object('total', COUNT(*))
  FROM public.guest_documents;

  -- AI gateway usage
  RETURN QUERY
  SELECT 'ai_gateway'::text, 'AI Gateway'::text,
    CASE
      WHEN COUNT(*) = 0 THEN 'not_configured'
      WHEN MAX(created_at) < _now - interval '7 days' THEN 'warning'
      ELSE 'healthy'
    END,
    MAX(created_at), NULL::timestamptz, NULL::text,
    'ai_usage_events'::text,
    jsonb_build_object('calls_7d', COUNT(*) FILTER (WHERE created_at > _now - interval '7 days'))
  FROM public.ai_usage_events;

  -- Database connectivity (this query running = healthy)
  RETURN QUERY
  SELECT 'database'::text, 'Database Connectivity'::text, 'healthy'::text,
    _now, NULL::timestamptz, NULL::text, 'live'::text,
    jsonb_build_object('checked_at', _now);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ops_service_health() TO authenticated;

-- =========================================================
-- get_ops_exceptions: deterministic exceptions queue
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_ops_exceptions()
RETURNS TABLE(
  exception_key text,
  severity text,
  booking_id uuid,
  guest_name text,
  unit_name text,
  check_in date,
  affected_system text,
  what_failed text,
  why_matters text,
  suggested_action text,
  detail jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- Pickup requested but no driver assigned, arrival within 24h
  RETURN QUERY
  SELECT 'pickup_no_driver'::text, 'high'::text, b.id,
    p.full_name, u.name, b.check_in, 'pickup'::text,
    'Pickup requested but no driver assigned'::text,
    'Guest arriving within 24 hours without a confirmed driver'::text,
    'Assign a driver in Airport Pickups'::text,
    jsonb_build_object('pickup_id', ap.id, 'flight', ap.flight_number)
  FROM public.airport_pickups ap
  JOIN public.bookings b ON b.id = ap.booking_id
  LEFT JOIN public.units u ON u.id = b.unit_id
  LEFT JOIN public.profiles p ON p.user_id = b.guest_id
  WHERE ap.driver_id IS NULL
    AND b.state IN ('confirmed','checked_in')
    AND b.check_in <= (now()::date + 1)
    AND b.check_in >= now()::date;

  -- Confirmed booking with deposit obligation unpaid, arriving in <= 3 days
  RETURN QUERY
  SELECT 'deposit_unpaid_near_arrival'::text, 'high'::text, b.id,
    p.full_name, u.name, b.check_in, 'payment'::text,
    'Deposit obligation still pending'::text,
    'Arrival in 3 days or fewer with no deposit recorded'::text,
    'Send payment link or confirm offline payment'::text,
    jsonb_build_object('amount', pay.amount)
  FROM public.bookings b
  JOIN public.payments pay ON pay.booking_id = b.id
  LEFT JOIN public.units u ON u.id = b.unit_id
  LEFT JOIN public.profiles p ON p.user_id = b.guest_id
  WHERE pay.payment_type = 'deposit' AND pay.status = 'pending'
    AND b.state IN ('pending_deposit','confirmed')
    AND b.check_in <= (now()::date + 3)
    AND b.check_in >= now()::date;

  -- Payment obligation exists but no payment link
  RETURN QUERY
  SELECT 'obligation_no_link'::text, 'medium'::text, b.id,
    p.full_name, u.name, b.check_in, 'payment'::text,
    'Pending payment without a payment link'::text,
    'Guest has nothing to click — collection will stall'::text,
    'Generate a payment link'::text,
    jsonb_build_object('payment_id', pay.id, 'type', pay.payment_type)
  FROM public.payments pay
  JOIN public.bookings b ON b.id = pay.booking_id
  LEFT JOIN public.units u ON u.id = b.unit_id
  LEFT JOIN public.profiles p ON p.user_id = b.guest_id
  WHERE pay.status = 'pending'
    AND pay.payment_type IN ('deposit','booking_fee','security_deposit')
    AND pay.created_at < now() - interval '6 hours'
    AND NOT EXISTS (
      SELECT 1 FROM public.payment_links pl
      WHERE pl.booking_id = b.id AND pl.used_at IS NULL AND pl.revoked_at IS NULL
    )
    AND b.state NOT IN ('cancelled','completed','no_show');

  -- Checked-in booking missing TM30 confirmation after 1+ nights
  RETURN QUERY
  SELECT 'tm30_missing'::text, 'medium'::text, b.id,
    p.full_name, u.name, b.check_in, 'documents'::text,
    'TM30 not confirmed for stay >= 1 night'::text,
    'Thai immigration compliance requirement for foreign guests'::text,
    'Confirm TM30 on booking detail'::text,
    jsonb_build_object('nights', (b.check_out - b.check_in))
  FROM public.bookings b
  LEFT JOIN public.units u ON u.id = b.unit_id
  LEFT JOIN public.profiles p ON p.user_id = b.guest_id
  WHERE b.state = 'checked_in'
    AND (b.arrival_details->'tm30'->>'confirmed') IS DISTINCT FROM 'true'
    AND (b.check_out - b.check_in) >= 1;

  -- Completed booking but no housekeeping task
  RETURN QUERY
  SELECT 'turnover_missing'::text, 'medium'::text, b.id,
    p.full_name, u.name, b.check_in, 'housekeeping'::text,
    'Checkout completed but no turnover task created'::text,
    'Unit may be marked dirty without any cleaner assigned'::text,
    'Create a manual housekeeping task'::text,
    jsonb_build_object()
  FROM public.bookings b
  LEFT JOIN public.units u ON u.id = b.unit_id
  LEFT JOIN public.profiles p ON p.user_id = b.guest_id
  WHERE b.state = 'completed'
    AND b.updated_at > now() - interval '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.housekeeping_tasks ht WHERE ht.booking_out_id = b.id
    );

  -- Active booking on inactive unit
  RETURN QUERY
  SELECT 'active_on_inactive_unit'::text, 'high'::text, b.id,
    p.full_name, u.name, b.check_in, 'inventory'::text,
    'Active booking assigned to an inactive unit'::text,
    'Unit is marked inactive — availability/pricing logic may misbehave'::text,
    'Reactivate the unit or reassign the booking'::text,
    jsonb_build_object('unit_id', u.id)
  FROM public.bookings b
  JOIN public.units u ON u.id = b.unit_id
  LEFT JOIN public.profiles p ON p.user_id = b.guest_id
  WHERE u.is_active = false
    AND b.state IN ('confirmed','checked_in','pending_deposit')
    AND b.check_out >= now()::date;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ops_exceptions() TO authenticated;
