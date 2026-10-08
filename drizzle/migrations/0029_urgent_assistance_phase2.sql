CREATE TABLE public.responder_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid,
  can_receive_alerts boolean NOT NULL DEFAULT true,
  can_assist_on_site boolean NOT NULL DEFAULT false,
  approved_by uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, property_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.responder_capabilities TO authenticated;
GRANT ALL ON public.responder_capabilities TO service_role;
ALTER TABLE public.responder_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read responders" ON public.responder_capabilities FOR SELECT TO authenticated
  USING (public.has_ops_read(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Managers manage responders" ON public.responder_capabilities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND approved_by = auth.uid());

CREATE TABLE public.duty_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  primary_user_id uuid NOT NULL,
  backup_user_id uuid,
  note text,
  approved_by uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (backup_user_id IS NULL OR backup_user_id <> primary_user_id)
);
CREATE INDEX duty_roster_window_idx ON public.duty_roster (starts_at, ends_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.duty_roster TO authenticated;
GRANT ALL ON public.duty_roster TO service_role;
ALTER TABLE public.duty_roster ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read roster" ON public.duty_roster FOR SELECT TO authenticated
  USING (public.has_ops_read(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "Managers manage roster" ON public.duty_roster FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND approved_by = auth.uid());

CREATE OR REPLACE FUNCTION public.validate_duty_roster()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM responder_capabilities WHERE user_id = NEW.primary_user_id AND can_receive_alerts) THEN
    RAISE EXCEPTION 'Primary must be an approved responder who can receive alerts';
  END IF;
  IF NEW.backup_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM responder_capabilities WHERE user_id = NEW.backup_user_id AND can_receive_alerts) THEN
    RAISE EXCEPTION 'Backup must be an approved responder who can receive alerts';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_duty_roster BEFORE INSERT OR UPDATE ON public.duty_roster
FOR EACH ROW EXECUTE FUNCTION public.validate_duty_roster();

CREATE OR REPLACE FUNCTION public.get_current_coverage(_at timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record;
BEGIN
  IF NOT (public.has_ops_read(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'Staff only' USING ERRCODE='42501';
  END IF;
  SELECT * INTO s FROM duty_roster WHERE _at >= starts_at AND _at < ends_at ORDER BY starts_at DESC LIMIT 1;
  RETURN jsonb_build_object(
    'shift_id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
    'primary_user_id', s.primary_user_id, 'backup_user_id', s.backup_user_id,
    'primary_on_site', (SELECT bool_or(can_assist_on_site) FROM responder_capabilities WHERE user_id = s.primary_user_id),
    'backup_on_site', (SELECT bool_or(can_assist_on_site) FROM responder_capabilities WHERE user_id = s.backup_user_id),
    'gap', s.id IS NULL,
    'auto_escalation_enabled', coalesce(public._assist_setting('auto_escalation_enabled'),'false') = 'true'
  );
END $$;
GRANT EXECUTE ON FUNCTION public.get_current_coverage(timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_assistance_setting(_key text, _value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'Managers and admins only' USING ERRCODE = '42501';
  END IF;
  IF _key NOT IN ('urgent_call_number','whatsapp_display_number','staffed_hours_text','after_hours_notice','urgent_requests_enabled',
                  'auto_escalation_enabled','escalation_backup_minutes','escalation_managers_minutes','escalation_reminder_minutes') THEN
    RAISE EXCEPTION 'Unknown assistance setting';
  END IF;
  IF EXISTS (SELECT 1 FROM policy_settings WHERE key=_key AND property_id IS NULL) THEN
    UPDATE policy_settings SET value=_value, updated_by=auth.uid(), updated_at=now() WHERE key=_key AND property_id IS NULL;
  ELSE
    INSERT INTO policy_settings(key, value, description, updated_by) VALUES (_key, _value, 'After-hours guest assistance', auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_escalation_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'auto_escalation_enabled', coalesce(public._assist_setting('auto_escalation_enabled'),'false') = 'true',
    'escalation_backup_minutes', coalesce(nullif(public._assist_setting('escalation_backup_minutes'),'')::int, 10),
    'escalation_managers_minutes', coalesce(nullif(public._assist_setting('escalation_managers_minutes'),'')::int, 20),
    'escalation_reminder_minutes', coalesce(nullif(public._assist_setting('escalation_reminder_minutes'),'')::int, 30))
  WHERE public.has_ops_read(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
$$;
GRANT EXECUTE ON FUNCTION public.get_escalation_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.run_urgent_escalations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.run_urgent_escalations() FROM public, anon, authenticated;