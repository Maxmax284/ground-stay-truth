CREATE OR REPLACE FUNCTION public.run_urgent_escalations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e record; s record; n int := 0;
  x int := coalesce(nullif(public._assist_setting('escalation_backup_minutes'),'')::int, 10);
  y int := coalesce(nullif(public._assist_setting('escalation_managers_minutes'),'')::int, 20);
  z int := coalesce(nullif(public._assist_setting('escalation_reminder_minutes'),'')::int, 30);
  msg text;
BEGIN
  IF coalesce(public._assist_setting('auto_escalation_enabled'),'false') <> 'true' THEN RETURN 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM guest_escalations WHERE kind='urgent_request' AND resolved=false) THEN RETURN 0; END IF;
  PERFORM set_config('app.escalation_tx','1',true);

  FOR e IN SELECT * FROM guest_escalations
    WHERE kind='urgent_request' AND resolved=false AND coalesce(next_escalation_at, created_at) <= now()
    ORDER BY created_at FOR UPDATE SKIP LOCKED
  LOOP
    s := NULL;
    SELECT * INTO s FROM duty_roster WHERE now() >= starts_at AND now() < ends_at ORDER BY starts_at DESC LIMIT 1;
    IF s.id IS NULL AND nullif(public._assist_setting('default_oncall_primary'),'') IS NOT NULL THEN
      SELECT 'default_oncall'::text AS id,
             public._assist_setting('default_oncall_primary')::uuid AS primary_user_id,
             nullif(public._assist_setting('default_oncall_backup'),'')::uuid AS backup_user_id
        INTO s;
    END IF;
    msg := 'Urgent guest request: ' || replace(coalesce(e.category,'other'),'_',' ');

    IF e.acknowledged_at IS NULL THEN
      IF s.id IS NULL AND e.escalation_level < 3 THEN
        INSERT INTO notifications(user_id, type, reference_id, message)
          SELECT DISTINCT user_id, 'urgent_escalation', e.id, msg || ' — NO COVERAGE on roster'
          FROM user_roles WHERE role IN ('admin','manager');
        BEGIN
          PERFORM public.emit_admin_alert('urgent_guest_request_escalated', msg || ' — NOBODY ON THE ROSTER', e.booking_id,
            '/front-desk', jsonb_build_object('booking_id', e.booking_id, 'escalation_id', e.id, 'level', 3, 'reason', 'no coverage'));
        EXCEPTION WHEN others THEN NULL; END;
        UPDATE guest_escalations SET escalation_level=3, status='escalated', next_escalation_at=now() + make_interval(mins=>z) WHERE id=e.id;
        INSERT INTO guest_escalation_events(escalation_id, booking_id, action, meta) VALUES (e.id, e.booking_id, 'coverage_gap_escalated', jsonb_build_object('level',3));
      ELSIF e.escalation_level = 0 THEN
        INSERT INTO notifications(user_id, type, reference_id, message) VALUES (s.primary_user_id, 'urgent_escalation', e.id, msg || ' — you are on duty');
        UPDATE guest_escalations SET escalation_level=1, next_escalation_at=e.created_at + make_interval(mins=>x) WHERE id=e.id;
        INSERT INTO guest_escalation_events(escalation_id, booking_id, action, meta) VALUES (e.id, e.booking_id, 'notified_primary', jsonb_build_object('user', s.primary_user_id, 'shift', s.id));
      ELSIF e.escalation_level = 1 THEN
        IF s.backup_user_id IS NOT NULL THEN
          INSERT INTO notifications(user_id, type, reference_id, message) VALUES (s.backup_user_id, 'urgent_escalation', e.id, msg || ' — not acknowledged, you are backup');
        END IF;
        UPDATE guest_escalations SET escalation_level=2, status='escalated', next_escalation_at=e.created_at + make_interval(mins=>y) WHERE id=e.id;
        INSERT INTO guest_escalation_events(escalation_id, booking_id, action, meta) VALUES (e.id, e.booking_id, 'escalated_backup', jsonb_build_object('user', s.backup_user_id, 'no_backup', s.backup_user_id IS NULL));
      ELSIF e.escalation_level = 2 THEN
        INSERT INTO notifications(user_id, type, reference_id, message)
          SELECT DISTINCT user_id, 'urgent_escalation', e.id, msg || ' — still not acknowledged'
          FROM user_roles WHERE role IN ('admin','manager');
        BEGIN
          PERFORM public.emit_admin_alert('urgent_guest_request_escalated', msg || ' — not acknowledged', e.booking_id,
            '/front-desk', jsonb_build_object('booking_id', e.booking_id, 'escalation_id', e.id, 'level', 3, 'reason', 'not acknowledged'));
        EXCEPTION WHEN others THEN NULL; END;
        UPDATE guest_escalations SET escalation_level=3, next_escalation_at=now() + make_interval(mins=>z) WHERE id=e.id;
        INSERT INTO guest_escalation_events(escalation_id, booking_id, action, meta) VALUES (e.id, e.booking_id, 'escalated_managers', jsonb_build_object('level',3));
      ELSE
        INSERT INTO notifications(user_id, type, reference_id, message)
          SELECT DISTINCT user_id, 'urgent_reminder', e.id, msg || ' — still not acknowledged'
          FROM user_roles WHERE role IN ('admin','manager');
        UPDATE guest_escalations SET next_escalation_at=now() + make_interval(mins=>z) WHERE id=e.id;
        INSERT INTO guest_escalation_events(escalation_id, booking_id, action) VALUES (e.id, e.booking_id, 'unacknowledged_reminder');
      END IF;
    ELSE
      IF e.next_escalation_at IS NOT NULL THEN
        INSERT INTO notifications(user_id, type, reference_id, message)
          SELECT DISTINCT u, 'urgent_reminder', e.id, msg || ' — acknowledged but still open'
          FROM (VALUES (e.assigned_to), (e.acknowledged_by)) v(u) WHERE u IS NOT NULL;
        INSERT INTO guest_escalation_events(escalation_id, booking_id, action) VALUES (e.id, e.booking_id, 'unresolved_reminder');
      END IF;
      UPDATE guest_escalations SET next_escalation_at=now() + make_interval(mins=>z) WHERE id=e.id;
    END IF;
    n := n + 1;
  END LOOP;
  PERFORM set_config('app.escalation_tx','',true);
  RETURN n;
END $function$;