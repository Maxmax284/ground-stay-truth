
-- Fix column-name bugs in existing health probe
CREATE OR REPLACE FUNCTION public.get_ops_service_health()
 RETURNS TABLE(key text, label text, status text, last_success_at timestamptz, last_failure_at timestamptz, last_error text, source text, detail jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _now timestamptz := now();
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'admin only'; END IF;

  RETURN QUERY
  SELECT 'stripe_webhook'::text, 'Stripe Webhook'::text,
    CASE WHEN wh.status='failing' THEN 'broken'
         WHEN wh.last_success_at IS NULL THEN 'unknown'
         WHEN wh.last_success_at < _now - interval '24 hours' THEN 'warning'
         ELSE 'healthy' END,
    wh.last_success_at, wh.last_failure_at, wh.last_failure_reason,
    'webhook_health'::text,
    jsonb_build_object('provider','stripe','last_event_id', wh.last_event_id)
  FROM public.webhook_health wh WHERE wh.provider='stripe'
  UNION ALL SELECT 'stripe_webhook','Stripe Webhook','not_configured',NULL,NULL,
    'No webhook events received yet','webhook_health',
    jsonb_build_object('hint','Trigger a Stripe test event to populate webhook_health')
  WHERE NOT EXISTS (SELECT 1 FROM public.webhook_health WHERE provider='stripe');

  RETURN QUERY
  SELECT 'payment_links'::text, 'Payment Link Generation'::text,
    CASE WHEN MAX(created_at) IS NULL THEN 'unknown'
         WHEN MAX(created_at) < _now - interval '7 days' THEN 'warning'
         ELSE 'healthy' END,
    MAX(created_at), NULL::timestamptz, NULL::text,
    'payment_links'::text,
    jsonb_build_object('total_30d', COUNT(*) FILTER (WHERE created_at > _now - interval '30 days'))
  FROM public.payment_links;

  -- Messaging uses `outcome` not `status`
  RETURN QUERY
  SELECT 'messaging'::text, 'Messaging Channels'::text,
    CASE WHEN COUNT(*)=0 THEN 'not_configured'
         WHEN MAX(created_at) FILTER (WHERE outcome IN ('delivered','sent','ok')) IS NULL THEN 'warning'
         WHEN MAX(created_at) FILTER (WHERE outcome IN ('failed','error')) >
              COALESCE(MAX(created_at) FILTER (WHERE outcome IN ('delivered','sent','ok')), 'epoch'::timestamptz) THEN 'broken'
         ELSE 'healthy' END,
    MAX(created_at) FILTER (WHERE outcome IN ('delivered','sent','ok')),
    MAX(created_at) FILTER (WHERE outcome IN ('failed','error')),
    (SELECT error FROM public.messaging_notification_log
       WHERE outcome IN ('failed','error') ORDER BY created_at DESC LIMIT 1),
    'messaging_notification_log'::text,
    jsonb_build_object('total_7d', COUNT(*) FILTER (WHERE created_at > _now - interval '7 days'))
  FROM public.messaging_notification_log;

  RETURN QUERY
  SELECT 'flight_api'::text, 'Flight Tracking API'::text,
    CASE WHEN COUNT(*)=0 THEN 'not_configured'
         WHEN MAX(last_checked_at) < _now - interval '6 hours' THEN 'warning'
         ELSE 'healthy' END,
    MAX(last_checked_at), NULL::timestamptz, NULL::text,
    'flight_tracking'::text, jsonb_build_object('rows', COUNT(*))
  FROM public.flight_tracking;

  -- booking_state_log uses `created_at`, not `changed_at`
  RETURN QUERY
  SELECT 'booking_state'::text, 'Booking State Machine'::text,
    CASE WHEN MAX(created_at) IS NULL THEN 'unknown'
         WHEN MAX(created_at) < _now - interval '30 days' THEN 'warning'
         ELSE 'healthy' END,
    MAX(created_at), NULL::timestamptz, NULL::text,
    'booking_state_log'::text,
    jsonb_build_object('transitions_7d', COUNT(*) FILTER (WHERE created_at > _now - interval '7 days'))
  FROM public.booking_state_log;

  RETURN QUERY
  SELECT 'notifications'::text, 'In-App Notifications'::text,
    CASE WHEN MAX(created_at) IS NULL THEN 'unknown'
         WHEN MAX(created_at) < _now - interval '7 days' THEN 'warning'
         ELSE 'healthy' END,
    MAX(created_at), NULL::timestamptz, NULL::text,
    'notifications'::text,
    jsonb_build_object('total_7d', COUNT(*) FILTER (WHERE created_at > _now - interval '7 days'))
  FROM public.notifications;

  RETURN QUERY
  SELECT 'housekeeping'::text, 'Housekeeping Turnover'::text,
    CASE WHEN MAX(created_at) IS NULL THEN 'unknown' ELSE 'healthy' END,
    MAX(created_at), NULL::timestamptz, NULL::text,
    'housekeeping_tasks'::text,
    jsonb_build_object('open', COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'completed'))
  FROM public.housekeeping_tasks;

  RETURN QUERY
  SELECT 'audit_log'::text, 'Audit Log Writes'::text,
    CASE WHEN MAX(created_at) IS NULL THEN 'unknown'
         WHEN MAX(created_at) < _now - interval '14 days' THEN 'warning'
         ELSE 'healthy' END,
    MAX(created_at), NULL::timestamptz, NULL::text,
    'staff_audit_events'::text,
    jsonb_build_object('events_7d', COUNT(*) FILTER (WHERE created_at > _now - interval '7 days'))
  FROM public.staff_audit_events;

  RETURN QUERY
  SELECT 'documents'::text, 'Document Storage'::text,
    CASE WHEN MAX(created_at) IS NULL THEN 'not_configured' ELSE 'healthy' END,
    MAX(created_at), NULL::timestamptz, NULL::text,
    'guest_documents'::text, jsonb_build_object('total', COUNT(*))
  FROM public.guest_documents;

  RETURN QUERY
  SELECT 'ai_gateway'::text, 'AI Gateway'::text,
    CASE WHEN COUNT(*)=0 THEN 'not_configured'
         WHEN MAX(created_at) < _now - interval '7 days' THEN 'warning'
         ELSE 'healthy' END,
    MAX(created_at), NULL::timestamptz, NULL::text,
    'ai_usage_events'::text,
    jsonb_build_object('calls_7d', COUNT(*) FILTER (WHERE created_at > _now - interval '7 days'))
  FROM public.ai_usage_events;

  RETURN QUERY
  SELECT 'database'::text, 'Database Connectivity'::text, 'healthy'::text,
    _now, NULL::timestamptz, NULL::text, 'live'::text,
    jsonb_build_object('checked_at', _now);
END;
$function$;

-- Per-booking operational timeline (admin-only)
CREATE OR REPLACE FUNCTION public.get_booking_operational_timeline(_booking_id uuid)
 RETURNS TABLE(occurred_at timestamptz, category text, label text, detail text, actor text, data jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'admin or manager only';
  END IF;

  RETURN QUERY
  SELECT bsl.created_at, 'state'::text,
    'State: ' || COALESCE(bsl.from_state::text,'∅') || ' → ' || bsl.to_state::text,
    bsl.reason, COALESCE(p.email,'system'),
    jsonb_build_object('seq', bsl.seq)
  FROM public.booking_state_log bsl
  LEFT JOIN public.profiles p ON p.user_id = bsl.changed_by
  WHERE bsl.booking_id = _booking_id

  UNION ALL
  SELECT pay.created_at, 'payment'::text,
    'Payment ' || pay.payment_type || ' · ' || pay.status,
    COALESCE(pay.description, pay.notes), COALESCE(prof.email,'system'),
    jsonb_build_object('amount', pay.amount, 'method', pay.method, 'provider', pay.provider)
  FROM public.payments pay
  LEFT JOIN public.profiles prof ON prof.user_id = pay.recorded_by
  WHERE pay.booking_id = _booking_id

  UNION ALL
  SELECT ple.created_at, 'payment_link'::text,
    'Payment link: ' || ple.event_type,
    NULL, COALESCE(ple.actor_role,'system'),
    COALESCE(ple.context,'{}'::jsonb)
  FROM public.payment_link_events ple
  WHERE ple.booking_id = _booking_id

  UNION ALL
  SELECT gasl.fired_at, 'arrival'::text,
    'Arrival stage: ' || gasl.stage,
    NULL, COALESCE(gasl.triggered_by,'system'),
    COALESCE(gasl.context,'{}'::jsonb)
  FROM public.guest_arrival_stage_log gasl
  WHERE gasl.booking_id = _booking_id

  UNION ALL
  SELECT ht.created_at, 'housekeeping'::text,
    'Housekeeping task ' || ht.status,
    ht.notes, NULL,
    jsonb_build_object('due_by', ht.due_by, 'completed_at', ht.completed_at)
  FROM public.housekeeping_tasks ht
  WHERE ht.booking_out_id = _booking_id OR ht.booking_in_id = _booking_id

  UNION ALL
  SELECT ap.created_at, 'pickup'::text,
    'Pickup ' || COALESCE(ap.status,'created') ||
      CASE WHEN ap.driver_id IS NOT NULL THEN ' · driver assigned' ELSE ' · unassigned' END,
    ap.special_instructions, NULL,
    jsonb_build_object('flight', ap.flight_number, 'arrival', ap.arrival_datetime, 'fee', ap.fee)
  FROM public.airport_pickups ap
  WHERE ap.booking_id = _booking_id

  UNION ALL
  SELECT sae.created_at, 'audit'::text,
    'Audit: ' || sae.event_type,
    sae.reason, sae.actor_email,
    COALESCE(sae.metadata,'{}'::jsonb)
  FROM public.staff_audit_events sae
  WHERE (sae.metadata->>'booking_id') = _booking_id::text

  ORDER BY 1 DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_booking_operational_timeline(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booking_operational_timeline(uuid) TO authenticated;
