CREATE OR REPLACE FUNCTION public.staff_log_urgent_request(_booking_id uuid, _category text, _source text, _details text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); b record; esc record; new_id uuid; note text;
BEGIN
  IF uid IS NULL OR NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = uid AND role <> 'guest') THEN
    RAISE EXCEPTION 'Staff only' USING ERRCODE='42501';
  END IF;
  IF _category NOT IN ('locked_out','access','medical','safety','room_problem','other') THEN RAISE EXCEPTION 'Unknown category'; END IF;
  IF _source NOT IN ('phone','whatsapp','walk_in','other') THEN RAISE EXCEPTION 'Unknown source'; END IF;
  SELECT id, guest_id, property_id, state INTO b FROM bookings WHERE id=_booking_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.state IN ('cancelled','no_show','completed') THEN RAISE EXCEPTION 'Booking is not active'; END IF;
  note := left(nullif(trim(_details),''), 1000);
  PERFORM set_config('app.escalation_tx','1',true);

  SELECT * INTO esc FROM guest_escalations WHERE booking_id=_booking_id AND kind='urgent_request' AND resolved=false
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF esc.id IS NOT NULL THEN
    INSERT INTO guest_escalation_events(escalation_id, booking_id, actor_id, action, note, meta)
      VALUES (esc.id, _booking_id, uid, 'staff_update', note, jsonb_build_object('category',_category,'source',_source));
    RETURN jsonb_build_object('id', esc.id, 'updated_existing', true);
  END IF;

  INSERT INTO guest_escalations(guest_user_id, channel, chat_id, summary, kind, booking_id, property_id, category,
     source, status, details, high_volume, received_at)
  VALUES (b.guest_id, _source, _booking_id::text, 'Urgent: ' || _category, 'urgent_request', _booking_id, b.property_id,
     _category, 'staff_' || _source, 'open', note, false, now())
  RETURNING id INTO new_id;
  INSERT INTO guest_escalation_events(escalation_id, booking_id, actor_id, action, note, meta)
    VALUES (new_id, _booking_id, uid, 'received', note, jsonb_build_object('category',_category,'source',_source,'logged_by_staff',true));
  BEGIN
    PERFORM public.emit_admin_alert('urgent_guest_request',
      'Urgent guest request (' || replace(_source,'_',' ') || '): ' || replace(_category,'_',' '), _booking_id,
      '/bookings?booking=' || _booking_id::text,
      jsonb_build_object('booking_id',_booking_id,'category',_category,'escalation_id',new_id,'source',_source));
    UPDATE guest_escalations SET last_alerted_at=now() WHERE id=new_id;
    INSERT INTO guest_escalation_events(escalation_id, booking_id, action, meta) VALUES (new_id, _booking_id, 'alert_queued', '{}'::jsonb);
  EXCEPTION WHEN others THEN
    INSERT INTO guest_escalation_events(escalation_id, booking_id, action, note) VALUES (new_id, _booking_id, 'alert_failed', left(SQLERRM,200));
  END;
  RETURN jsonb_build_object('id', new_id, 'updated_existing', false);
END $$;
REVOKE ALL ON FUNCTION public.staff_log_urgent_request(uuid,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.staff_log_urgent_request(uuid,text,text,text) TO authenticated;