CREATE OR REPLACE FUNCTION public.reset_sandbox()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _prop uuid;
  _caller uuid := auth.uid();
  _grp_single uuid;
  _grp_villa uuid;
  _grp_deluxe uuid;
  _u_single1 uuid; _u_single2 uuid; _u_villa1 uuid; _u_villa2 uuid; _u_deluxe uuid;
  _today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  _bookings int := 0;
BEGIN
  IF NOT (public.has_role(_caller, 'admin') OR public.has_role(_caller, 'manager')) THEN
    RAISE EXCEPTION 'Only admins or managers can reset the sandbox';
  END IF;

  SELECT id INTO _prop FROM public.properties WHERE slug = 'sandbox';
  IF _prop IS NULL THEN
    INSERT INTO public.properties (slug, name, operational_mode, timezone, is_active, is_sandbox)
    VALUES ('sandbox', 'Sandbox Camp (Practice)', 'high_turnover', 'Asia/Bangkok', true, true)
    RETURNING id INTO _prop;
  ELSE
    UPDATE public.properties SET is_sandbox = true, is_active = true WHERE id = _prop;
  END IF;

  -- Fixed list of child tables (no SQL built at run time).
  DELETE FROM public.admin_alert_log WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.ai_action_drafts WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.airport_pickups WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.arrival_conflicts WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.booking_adjustments WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.booking_confirmation_log WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.booking_segments WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.booking_state_log WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.booking_training_links WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.early_checkin_requests WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.email_log WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.flight_provider_reads WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.guest_arrival_stage_log WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.guest_document_access_log WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.guest_documents WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.guest_escalation_events WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.guest_escalations WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.guest_portal_activity WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.journey_evidence WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.journey_leg_field_provenance WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.journey_legs WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.laundry_requests WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.maintenance_requests WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.messages WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.override_audit_log WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.payment_link_events WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.payment_links WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.payment_rejection_log WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.payments WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.pickup_driver_links WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.pickup_driver_messages WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.pre_arrival_checklist WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.reviews WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.security_deposits WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.stay_modifications WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.stay_support_log WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);
  DELETE FROM public.tax_invoices WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = _prop);

  DELETE FROM public.bookings WHERE property_id = _prop;
  DELETE FROM public.maintenance_blocks WHERE unit_id IN (SELECT id FROM public.units WHERE property_id = _prop);
  DELETE FROM public.pricing_rules
   WHERE unit_id IN (SELECT id FROM public.units WHERE property_id = _prop)
      OR group_id IN (SELECT DISTINCT group_id FROM public.units WHERE property_id = _prop AND group_id IS NOT NULL);
  DELETE FROM public.driver_property_assignments WHERE property_id = _prop;
  DELETE FROM public.units WHERE property_id = _prop;
  DELETE FROM public.unit_groups WHERE name LIKE 'SB %';

  INSERT INTO public.unit_groups (name, sort_order) VALUES ('SB Superior Single', 901) RETURNING id INTO _grp_single;
  INSERT INTO public.unit_groups (name, sort_order) VALUES ('SB Sea View Villa', 902) RETURNING id INTO _grp_villa;
  INSERT INTO public.unit_groups (name, sort_order) VALUES ('SB Deluxe Twin', 903) RETURNING id INTO _grp_deluxe;

  INSERT INTO public.units (property_id, group_id, name, capacity, base_price, cleaning_fee, sort_order, listing_category)
  VALUES (_prop, _grp_single, 'SB Superior Single 1', 1, 1000, 200, 1, 'on_site') RETURNING id INTO _u_single1;
  INSERT INTO public.units (property_id, group_id, name, capacity, base_price, cleaning_fee, sort_order, listing_category)
  VALUES (_prop, _grp_single, 'SB Superior Single 2', 1, 1000, 200, 2, 'on_site') RETURNING id INTO _u_single2;
  INSERT INTO public.units (property_id, group_id, name, capacity, base_price, cleaning_fee, sort_order, listing_category)
  VALUES (_prop, _grp_villa, 'SB Sea View Villa 1', 4, 1800, 400, 3, 'on_site') RETURNING id INTO _u_villa1;
  INSERT INTO public.units (property_id, group_id, name, capacity, base_price, cleaning_fee, sort_order, listing_category)
  VALUES (_prop, _grp_villa, 'SB Sea View Villa 2', 4, 1800, 400, 4, 'on_site') RETURNING id INTO _u_villa2;
  INSERT INTO public.units (property_id, group_id, name, capacity, base_price, cleaning_fee, sort_order, listing_category)
  VALUES (_prop, _grp_deluxe, 'SB Deluxe Twin 1', 2, 1400, 300, 5, 'on_site') RETURNING id INTO _u_deluxe;

  INSERT INTO public.bookings (property_id, unit_id, state, check_in, check_out, num_guests, total_price,
    manual_guest_name, manual_guest_email, manual_guest_phone, notes, pay_on_arrival)
  VALUES
    (_prop, _u_single1, 'checked_in', _today - 2, _today + 2, 1, 4000,
      'SB Somchai Extend', 'sandbox+extend@example.test', '+66900000001',
      'SANDBOX: extension possible in same room', false),
    (_prop, _u_villa1, 'checked_in', _today - 1, _today + 2, 2, 5400,
      'SB Anna Blocked', 'sandbox+blocked@example.test', '+66900000002',
      'SANDBOX: room booked immediately after -> must relocate to extend', false),
    (_prop, _u_villa1, 'confirmed', _today + 2, _today + 6, 2, 7200,
      'SB Blocker Booking', 'sandbox+blocker@example.test', '+66900000003',
      'SANDBOX: blocks Villa 1 to force a relocation', false),
    (_prop, _u_deluxe, 'confirmed', _today + 3, _today + 8, 2, 7000,
      'SB Upgrade Candidate', 'sandbox+upgrade@example.test', '+66900000004',
      'SANDBOX: upgrade / downgrade practice', false),
    (_prop, _u_single2, 'checked_in', _today, _today + 3, 1, 3000,
      'SB Pay On Arrival', 'sandbox+poa@example.test', '+66900000005',
      'SANDBOX: pay-on-arrival, should not show as overdue', true),
    (_prop, _u_villa2, 'confirmed', (date_trunc('month', _today) + interval '1 month - 2 days')::date,
      (date_trunc('month', _today) + interval '1 month 3 days')::date, 3, 9000,
      'SB Month Crosser', 'sandbox+month@example.test', '+66900000006',
      'SANDBOX: stay crosses month boundary', false);

  SELECT count(*) INTO _bookings FROM public.bookings WHERE property_id = _prop;

  INSERT INTO public.user_property_assignments (user_id, property_id, is_default)
  SELECT _caller, _prop, false
  WHERE _caller IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_property_assignments
      WHERE user_id = _caller AND property_id = _prop
    );

  RETURN jsonb_build_object(
    'property_id', _prop,
    'units', 5,
    'groups', 3,
    'bookings', _bookings,
    'reset_at', now()
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.reset_sandbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_sandbox() TO authenticated;