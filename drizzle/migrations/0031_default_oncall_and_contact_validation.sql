CREATE OR REPLACE FUNCTION public.set_assistance_setting(_key text, _value jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'Managers and admins only' USING ERRCODE = '42501';
  END IF;
  IF _key NOT IN ('urgent_call_number','whatsapp_display_number','staffed_hours_text','after_hours_notice','urgent_requests_enabled',
                  'auto_escalation_enabled','escalation_backup_minutes','escalation_managers_minutes','escalation_reminder_minutes',
                  'default_oncall_primary','default_oncall_backup') THEN
    RAISE EXCEPTION 'Unknown assistance setting';
  END IF;
  IF _key IN ('default_oncall_primary','default_oncall_backup') AND _value IS NOT NULL AND _value <> 'null'::jsonb THEN
    v := _value #>> '{}';
    IF v !~ '^[0-9a-f-]{36}$' OR NOT EXISTS (SELECT 1 FROM responder_capabilities WHERE user_id = v::uuid AND can_receive_alerts) THEN
      RAISE EXCEPTION 'Default on-call must be an approved responder who can be notified';
    END IF;
  END IF;
  IF _key IN ('urgent_call_number','whatsapp_display_number') AND _value IS NOT NULL AND _value <> 'null'::jsonb THEN
    IF (_value #>> '{}') !~ '^\+[1-9][0-9]{7,14}$' THEN
      RAISE EXCEPTION 'Use international format, e.g. +66812345678';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM policy_settings WHERE key=_key AND property_id IS NULL) THEN
    UPDATE policy_settings SET value=_value, updated_by=auth.uid(), updated_at=now() WHERE key=_key AND property_id IS NULL;
  ELSE
    INSERT INTO policy_settings(key, value, description, updated_by) VALUES (_key, _value, 'After-hours guest assistance', auth.uid());
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.get_current_coverage(_at timestamp with time zone DEFAULT now())
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s record; dp uuid; db uuid; p uuid; b uuid; src text;
BEGIN
  IF NOT (public.has_ops_read(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'Staff only' USING ERRCODE='42501';
  END IF;
  SELECT * INTO s FROM duty_roster WHERE _at >= starts_at AND _at < ends_at ORDER BY starts_at DESC LIMIT 1;
  dp := nullif(public._assist_setting('default_oncall_primary'),'')::uuid;
  db := nullif(public._assist_setting('default_oncall_backup'),'')::uuid;
  IF s.id IS NOT NULL THEN p := s.primary_user_id; b := s.backup_user_id; src := 'roster';
  ELSIF dp IS NOT NULL THEN p := dp; b := db; src := 'default';
  ELSE src := 'none'; END IF;
  RETURN jsonb_build_object(
    'shift_id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
    'primary_user_id', p, 'backup_user_id', b, 'source', src,
    'default_primary_user_id', dp, 'default_backup_user_id', db,
    'primary_on_site', (SELECT bool_or(can_assist_on_site) FROM responder_capabilities WHERE user_id = p),
    'backup_on_site', (SELECT bool_or(can_assist_on_site) FROM responder_capabilities WHERE user_id = b),
    'gap', p IS NULL,
    'auto_escalation_enabled', coalesce(public._assist_setting('auto_escalation_enabled'),'false') = 'true'
  );
END $function$;

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
            '/front-desk', jsonb_build_object('escalation_id', e.id, 'level', 3));
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