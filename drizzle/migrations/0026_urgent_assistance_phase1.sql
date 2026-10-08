-- Extend guest_escalations (additive, legacy messaging rows untouched: kind stays NULL)
ALTER TABLE public.guest_escalations
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS booking_id uuid,
  ADD COLUMN IF NOT EXISTS property_id uuid,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS details text,
  ADD COLUMN IF NOT EXISTS high_volume boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_alerted_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid,
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_escalation_at timestamptz,
  ADD COLUMN IF NOT EXISTS addressed_at timestamptz,
  ADD COLUMN IF NOT EXISTS addressed_by uuid,
  ADD COLUMN IF NOT EXISTS resolution_note text;

COMMENT ON COLUMN public.guest_escalations.kind IS 'NULL = legacy messaging handoff; urgent_request = portal urgent assistance incident';
CREATE INDEX IF NOT EXISTS guest_escalations_open_urgent_idx ON public.guest_escalations (booking_id) WHERE kind = 'urgent_request' AND resolved = false;

-- Immutable event history
CREATE TABLE IF NOT EXISTS public.guest_escalation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id uuid NOT NULL REFERENCES public.guest_escalations(id),
  booking_id uuid,
  actor_id uuid,
  action text NOT NULL,
  note text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.guest_escalation_events TO authenticated;
GRANT ALL ON public.guest_escalation_events TO service_role;
ALTER TABLE public.guest_escalation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read escalation events" ON public.guest_escalation_events FOR SELECT TO authenticated
  USING (public.has_ops_read(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE OR REPLACE FUNCTION public.block_escalation_event_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Escalation history is permanent' USING ERRCODE = '42501'; END $$;
CREATE TRIGGER guard_escalation_events BEFORE UPDATE OR DELETE ON public.guest_escalation_events
FOR EACH ROW EXECUTE FUNCTION public.block_escalation_event_change();

-- Lifecycle columns may only move through the server functions below
CREATE OR REPLACE FUNCTION public.guard_escalation_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('app.escalation_tx', true) = '1' THEN RETURN NEW; END IF;
  IF NEW.kind IS DISTINCT FROM OLD.kind OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.category IS DISTINCT FROM OLD.category OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at OR NEW.acknowledged_by IS DISTINCT FROM OLD.acknowledged_by
     OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to OR NEW.escalation_level IS DISTINCT FROM OLD.escalation_level
     OR NEW.next_escalation_at IS DISTINCT FROM OLD.next_escalation_at OR NEW.addressed_at IS DISTINCT FROM OLD.addressed_at
     OR NEW.received_at IS DISTINCT FROM OLD.received_at OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
     OR (OLD.kind = 'urgent_request' AND (NEW.resolved IS DISTINCT FROM OLD.resolved OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at)) THEN
    RAISE EXCEPTION 'Use the urgent request actions to change incident status' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_escalation_lifecycle BEFORE UPDATE ON public.guest_escalations
FOR EACH ROW EXECUTE FUNCTION public.guard_escalation_lifecycle();

-- Helper: read a policy value as text (global row)
CREATE OR REPLACE FUNCTION public._assist_setting(_key text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE jsonb_typeof(value) WHEN 'string' THEN value #>> '{}' ELSE value::text END
  FROM policy_settings WHERE key = _key AND property_id IS NULL LIMIT 1
$$;
REVOKE ALL ON FUNCTION public._assist_setting(text) FROM public, anon, authenticated;

-- Guest-safe config (only the assistance display fields)
CREATE OR REPLACE FUNCTION public.get_guest_assistance_config()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'urgent_call_number', public._assist_setting('urgent_call_number'),
    'whatsapp_display_number', public._assist_setting('whatsapp_display_number'),
    'staffed_hours_text', public._assist_setting('staffed_hours_text'),
    'after_hours_notice', public._assist_setting('after_hours_notice'),
    'urgent_requests_enabled', coalesce(public._assist_setting('urgent_requests_enabled'),'false') = 'true'
  )
$$;
GRANT EXECUTE ON FUNCTION public.get_guest_assistance_config() TO authenticated;

-- Management sets assistance settings (logged by existing policy history trigger)
CREATE OR REPLACE FUNCTION public.set_assistance_setting(_key text, _value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'Managers and admins only' USING ERRCODE = '42501';
  END IF;
  IF _key NOT IN ('urgent_call_number','whatsapp_display_number','staffed_hours_text','after_hours_notice','urgent_requests_enabled') THEN
    RAISE EXCEPTION 'Unknown assistance setting';
  END IF;
  IF EXISTS (SELECT 1 FROM policy_settings WHERE key=_key AND property_id IS NULL) THEN
    UPDATE policy_settings SET value=_value, updated_by=auth.uid(), updated_at=now() WHERE key=_key AND property_id IS NULL;
  ELSE
    INSERT INTO policy_settings(key, value, description, updated_by) VALUES (_key, _value, 'After-hours guest assistance', auth.uid());
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.set_assistance_setting(text, jsonb) TO authenticated;

-- Guest creates (or updates) an urgent request on their own booking
CREATE OR REPLACE FUNCTION public.create_urgent_request(_booking_id uuid, _category text, _details text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); b record; esc record; new_id uuid; recent int; alert boolean := true;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  IF coalesce(public._assist_setting('urgent_requests_enabled'),'false') <> 'true' THEN
    RAISE EXCEPTION 'Urgent requests are not enabled' USING ERRCODE='P0001';
  END IF;
  IF _category NOT IN ('locked_out','access','medical','safety','room_problem','other') THEN
    RAISE EXCEPTION 'Unknown category';
  END IF;
  SELECT id, guest_id, property_id, state, check_in INTO b FROM bookings WHERE id=_booking_id;
  IF b.id IS NULL OR b.guest_id <> uid THEN RAISE EXCEPTION 'Not your booking' USING ERRCODE='42501'; END IF;
  IF NOT (b.state IN ('checked_in','confirmed') OR (b.check_in::date <= (now() + interval '48 hours')::date AND b.state IN ('pending_deposit','confirmed'))) THEN
    RAISE EXCEPTION 'Urgent requests are for current or arriving stays';
  END IF;
  _details := left(nullif(trim(_details),''), 1000);
  PERFORM set_config('app.escalation_tx','1',true);

  SELECT * INTO esc FROM guest_escalations
   WHERE booking_id=_booking_id AND kind='urgent_request' AND resolved=false
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF esc.id IS NOT NULL THEN
    -- Add to the open incident; never drop it. Re-alert at most every 2 minutes.
    INSERT INTO guest_escalation_events(escalation_id, booking_id, actor_id, action, note, meta)
      VALUES (esc.id, _booking_id, uid, 'guest_update', _details, jsonb_build_object('category', _category));
    alert := esc.last_alerted_at IS NULL OR esc.last_alerted_at < now() - interval '2 minutes';
    new_id := esc.id;
  ELSE
    SELECT count(*) INTO recent FROM guest_escalations
     WHERE booking_id=_booking_id AND kind='urgent_request' AND created_at > now() - interval '1 hour';
    INSERT INTO guest_escalations(guest_user_id, channel, chat_id, summary, kind, booking_id, property_id, category,
       source, status, details, high_volume, received_at)
    VALUES (uid, 'portal', _booking_id::text, 'Urgent: ' || _category, 'urgent_request', _booking_id, b.property_id,
       _category, 'portal', 'open', _details, recent >= 5, now())
    RETURNING id INTO new_id;
    INSERT INTO guest_escalation_events(escalation_id, booking_id, actor_id, action, note, meta)
      VALUES (new_id, _booking_id, uid, 'received', _details, jsonb_build_object('category', _category, 'high_volume', recent >= 5));
  END IF;

  IF alert THEN
    BEGIN
      PERFORM public.emit_admin_alert('urgent_guest_request',
        'Urgent guest request: ' || replace(_category,'_',' '), new_id,
        '/bookings?booking=' || _booking_id::text,
        jsonb_build_object('booking_id', _booking_id, 'category', _category, 'escalation_id', new_id));
      UPDATE guest_escalations SET last_alerted_at=now(), delivered_at=coalesce(delivered_at, now()) WHERE id=new_id;
      INSERT INTO guest_escalation_events(escalation_id, booking_id, action, meta)
        VALUES (new_id, _booking_id, 'alert_queued', '{}'::jsonb);
    EXCEPTION WHEN others THEN
      -- The request is still saved; staff see it on the board even if the alert failed.
      INSERT INTO guest_escalation_events(escalation_id, booking_id, action, note)
        VALUES (new_id, _booking_id, 'alert_failed', left(SQLERRM, 200));
    END;
  END IF;
  RETURN jsonb_build_object('id', new_id, 'updated_existing', esc.id IS NOT NULL);
END $$;
GRANT EXECUTE ON FUNCTION public.create_urgent_request(uuid, text, text) TO authenticated;

-- Staff lifecycle actions (acknowledge never resolves)
CREATE OR REPLACE FUNCTION public.urgent_request_action(_id uuid, _action text, _note text DEFAULT NULL, _assignee uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); e record;
BEGIN
  IF NOT (public.has_ops_write(uid) OR public.has_role(uid,'admin') OR public.has_role(uid,'manager')) THEN
    RAISE EXCEPTION 'Staff only' USING ERRCODE='42501';
  END IF;
  SELECT * INTO e FROM guest_escalations WHERE id=_id AND kind='urgent_request' FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Not an urgent request'; END IF;
  IF e.resolved AND _action <> 'note' THEN RAISE EXCEPTION 'Already resolved'; END IF;
  PERFORM set_config('app.escalation_tx','1',true);
  IF _action = 'acknowledge' THEN
    UPDATE guest_escalations SET acknowledged_at=coalesce(acknowledged_at,now()), acknowledged_by=coalesce(acknowledged_by,uid),
      status=CASE WHEN status='open' THEN 'acknowledged' ELSE status END WHERE id=_id;
  ELSIF _action = 'assign' THEN
    IF _assignee IS NULL OR NOT (public.has_ops_read(_assignee) OR public.has_role(_assignee,'admin') OR public.has_role(_assignee,'manager')) THEN
      RAISE EXCEPTION 'Assignee must be staff';
    END IF;
    UPDATE guest_escalations SET assigned_to=_assignee, assigned_at=now(),
      status=CASE WHEN status IN ('open','acknowledged') THEN 'assigned' ELSE status END WHERE id=_id;
  ELSIF _action = 'addressed' THEN
    UPDATE guest_escalations SET addressed_at=now(), addressed_by=uid, status='addressed' WHERE id=_id;
  ELSIF _action = 'resolve' THEN
    IF nullif(trim(_note),'') IS NULL THEN RAISE EXCEPTION 'A resolution note is required'; END IF;
    UPDATE guest_escalations SET resolved=true, resolved_at=now(), resolved_by=uid, status='resolved', resolution_note=_note WHERE id=_id;
  ELSIF _action NOT IN ('note','spam') THEN
    RAISE EXCEPTION 'Unknown action';
  END IF;
  IF _action = 'spam' THEN
    IF nullif(trim(_note),'') IS NULL THEN RAISE EXCEPTION 'A note is required'; END IF;
    UPDATE guest_escalations SET resolved=true, resolved_at=now(), resolved_by=uid, status='spam', resolution_note=_note WHERE id=_id;
  END IF;
  INSERT INTO guest_escalation_events(escalation_id, booking_id, actor_id, action, note, meta)
    VALUES (_id, e.booking_id, uid, _action, left(_note,1000), CASE WHEN _assignee IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('assignee',_assignee) END);
END $$;
GRANT EXECUTE ON FUNCTION public.urgent_request_action(uuid, text, text, uuid) TO authenticated;