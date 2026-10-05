CREATE OR REPLACE FUNCTION public.get_friction_radar_weekly(_weeks integer DEFAULT 4)
RETURNS TABLE(week_start date, portal_loaded bigint, booking_missing bigint, booking_missing_guests bigint,
  id_upload_started bigint, id_upload_success bigint, id_docs_rejected bigint,
  emails_sent bigint, emails_failed bigint, emails_bounced bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH weeks AS (
    SELECT (date_trunc('week', now()) - make_interval(weeks => g))::date AS ws
    FROM generate_series(0, LEAST(GREATEST(_weeks, 1), 12) - 1) g
  )
  SELECT w.ws,
    (SELECT count(*) FROM guest_portal_activity a WHERE a.created_at >= w.ws AND a.created_at < w.ws + 7 AND a.event_type='guest_portal_loaded' AND (a.booking_id IS NULL OR NOT is_sandbox_booking(a.booking_id))),
    (SELECT count(*) FROM guest_portal_activity a WHERE a.created_at >= w.ws AND a.created_at < w.ws + 7 AND a.event_type='guest_booking_missing'),
    (SELECT count(DISTINCT a.guest_id) FROM guest_portal_activity a WHERE a.created_at >= w.ws AND a.created_at < w.ws + 7 AND a.event_type='guest_booking_missing'),
    (SELECT count(*) FROM guest_portal_activity a WHERE a.created_at >= w.ws AND a.created_at < w.ws + 7 AND a.event_type='id_upload_started' AND (a.booking_id IS NULL OR NOT is_sandbox_booking(a.booking_id))),
    (SELECT count(*) FROM guest_portal_activity a WHERE a.created_at >= w.ws AND a.created_at < w.ws + 7 AND a.event_type='id_upload_success' AND (a.booking_id IS NULL OR NOT is_sandbox_booking(a.booking_id))),
    (SELECT count(*) FROM guest_documents d WHERE d.created_at >= w.ws AND d.created_at < w.ws + 7 AND NOT d.superseded AND d.review_status='rejected' AND NOT is_sandbox_booking(d.booking_id)),
    (SELECT count(*) FROM email_send_log e WHERE e.created_at >= w.ws AND e.created_at < w.ws + 7 AND e.status='sent'),
    (SELECT count(*) FROM email_send_log e WHERE e.created_at >= w.ws AND e.created_at < w.ws + 7 AND e.status IN ('failed','bounced','error')),
    (SELECT count(*) FROM email_send_log e WHERE e.created_at >= w.ws AND e.created_at < w.ws + 7 AND e.status='bounced')
  FROM weeks w ORDER BY w.ws DESC;
END $$;
REVOKE ALL ON FUNCTION public.get_friction_radar_weekly(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friction_radar_weekly(integer) TO authenticated, service_role;