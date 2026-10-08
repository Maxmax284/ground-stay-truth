CREATE OR REPLACE FUNCTION public.get_comms_health(_days int DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE since timestamptz := now() - make_interval(days => greatest(1, least(_days, 90)));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'days', greatest(1, least(_days, 90)),
    'email', (SELECT coalesce(jsonb_object_agg(status, n), '{}'::jsonb) FROM (SELECT status, count(*) n FROM email_send_log WHERE created_at >= since GROUP BY status) e),
    'push', (SELECT coalesce(jsonb_object_agg(status, n), '{}'::jsonb) FROM (SELECT status, count(*) n FROM push_delivery_log WHERE created_at >= since GROUP BY status) p),
    'push_devices', (SELECT count(*) FROM push_subscriptions),
    'push_users', (SELECT count(DISTINCT user_id) FROM push_subscriptions),
    'messages', (SELECT count(*) FROM messages WHERE created_at >= since),
    'drafts_waiting', (SELECT count(*) FROM messages WHERE draft = true),
    'orphan_messages', (SELECT count(*) FROM messages WHERE booking_id IS NULL),
    'recent_failures', (SELECT coalesce(jsonb_agg(f), '[]'::jsonb) FROM (
       SELECT template_name AS what, status, left(coalesce(error_message,''),120) AS error, created_at
       FROM email_send_log WHERE created_at >= since AND status NOT IN ('sent','pending','queued')
       ORDER BY created_at DESC LIMIT 5) f)
  );
END $$;
REVOKE ALL ON FUNCTION public.get_comms_health(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_comms_health(int) TO authenticated;