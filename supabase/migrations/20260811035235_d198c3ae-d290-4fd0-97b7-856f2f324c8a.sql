CREATE OR REPLACE FUNCTION public.reset_sandbox()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _prop uuid;
  _tbl text;
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

  -- Sandbox property (idempotent)
  SELECT id INTO _prop FROM public.properties WHERE slug = 'sandbox';
  IF _prop IS NULL THEN
    INSERT INTO public.properties (slug, name, operational_mode, timezone, is_active, is_sandbox)
    VALUES ('sandbox', 'Sandbox Camp (Practice)', 'high_turnover', 'Asia/Bangkok', true, true)
    RETURNING id INTO _prop;
  ELSE
    UPDATE public.properties SET is_sandbox = true, is_active = true WHERE id = _prop;
  END IF;

  -- Wipe every child row pointing at sandbox bookings
  FOR _tbl IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'booking_id'
  LOOP
    EXECUTE format(
      'DELETE FROM public.%I WHERE booking_id IN (SELECT id FROM public.bookings WHERE property_id = $1)',
      _tbl
    ) USING _prop;
  END LOOP;

  DELETE FROM public.bookings WHERE property_id = _prop;
  DELETE FROM public.maintenance_blocks WHERE unit_id IN (SELECT id FROM public.units WHERE property_id = _prop);
  -- pricing_rules is scoped by unit or group, not by property.
  DELETE FROM public.pricing_rules
   WHERE unit_id IN (SELECT id FROM public.units WHERE property_id = _prop)
      OR group_id IN (SELECT DISTINCT group_id FROM public.units WHERE property_id = _prop AND group_id IS NOT NULL);
  DELETE FROM public.driver_property_assignments WHERE property_id = _prop;
  DELETE FROM public.units WHERE property_id = _prop;
  -- unit_groups are global; sandbox groups are identified by their SB prefix.
  DELETE FROM public.unit_groups WHERE name LIKE 'SB %';

  -- Seed groups
  INSERT INTO public.unit_groups (name, sort_order) VALUES ('SB Superior Single', 901) RETURNING id INTO _grp_single;
  INSERT INTO public.unit_groups (name, sort_order) VALUES ('SB Sea View Villa', 902) RETURNING id INTO _grp_villa;
  INSERT INTO public.unit_groups (name, sort_order) VALUES ('SB Deluxe Twin', 903) RETURNING id INTO _grp_deluxe;

  -- Seed units
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

  -- Seed scenario bookings (fake guests, no auth users)
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

  -- Whoever resets the sandbox needs access to it, or the practice toggle
  -- can see the camp but cannot switch into it.
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
$fn$;

REVOKE ALL ON FUNCTION public.reset_sandbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_sandbox() TO authenticated;