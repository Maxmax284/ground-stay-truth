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
  IF NOT (b.state IN ('checked_in','confirmed') OR (b.check_in::date <= (now() + interval '48 hours')::date AND b.state = 'pending_deposit')) THEN
    RAISE EXCEPTION 'Urgent requests are for current or arriving stays';
  END IF;
  _details := left(nullif(trim(_details),''), 1000);
  PERFORM set_config('app.escalation_tx','1',true);

  SELECT * INTO esc FROM guest_escalations
   WHERE booking_id=_booking_id AND kind='urgent_request' AND resolved=false
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF esc.id IS NOT NULL THEN
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
      -- reference = booking so practice-camp bookings never alert real people
      PERFORM public.emit_admin_alert('urgent_guest_request',
        'Urgent guest request: ' || replace(_category,'_',' '), _booking_id,
        '/bookings?booking=' || _booking_id::text,
        jsonb_build_object('booking_id', _booking_id, 'category', _category, 'escalation_id', new_id));
      UPDATE guest_escalations SET last_alerted_at=now() WHERE id=new_id;
      INSERT INTO guest_escalation_events(escalation_id, booking_id, action, meta)
        VALUES (new_id, _booking_id, 'alert_queued', '{}'::jsonb);
    EXCEPTION WHEN others THEN
      INSERT INTO guest_escalation_events(escalation_id, booking_id, action, note)
        VALUES (new_id, _booking_id, 'alert_failed', left(SQLERRM, 200));
    END;
  END IF;
  RETURN jsonb_build_object('id', new_id, 'updated_existing', esc.id IS NOT NULL);
END $$;