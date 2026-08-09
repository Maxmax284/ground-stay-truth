-- 1. Sandbox flag on properties
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;

-- 2. Helpers
CREATE OR REPLACE FUNCTION public.is_sandbox_property(_property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_sandbox FROM public.properties WHERE id = _property_id), false);
$$;

CREATE OR REPLACE FUNCTION public.is_sandbox_booking(_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT p.is_sandbox
    FROM public.bookings b
    JOIN public.properties p ON p.id = b.property_id
    WHERE b.id = _booking_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.is_sandbox_property(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_sandbox_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_sandbox_property(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_sandbox_booking(uuid) TO authenticated, service_role;

-- 3. Mute admin alerts for sandbox bookings
CREATE OR REPLACE FUNCTION public.emit_admin_alert(
  _event_type text,
  _message text,
  _reference_id uuid DEFAULT NULL,
  _deep_link text DEFAULT NULL,
  _context jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _token text;
  _edge_url text := 'https://eglgvhnkwhozjnenwjxd.supabase.co/functions/v1/emit-admin-alert';
BEGIN
  -- Sandbox isolation: never alert real humans about fake stays
  IF _reference_id IS NOT NULL AND public.is_sandbox_booking(_reference_id) THEN
    RETURN;
  END IF;

  _token := public.get_integration_secret('admin_alert_internal_token');
  IF _token IS NULL OR length(_token) < 8 THEN
    RAISE WARNING 'emit_admin_alert: internal token not configured';
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := _edge_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'internal_token', _token,
        'event_type', _event_type,
        'message', _message,
        'reference_id', _reference_id,
        'deep_link', _deep_link,
        'context', COALESCE(_context, '{}'::jsonb)
      ),
      timeout_milliseconds := 1500
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'emit_admin_alert dispatch failed: %', SQLERRM;
  END;
END;
$fn$;

-- 4. Reset + seed sandbox
CREATE OR REPLACE FUNCTION public.reset_sandbox()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _prop uuid;
  _tbl text;
  _grp_single uuid;
  _grp_villa uuid;
  _grp_deluxe uuid;
  _u_single1 uuid; _u_single2 uuid; _u_villa1 uuid; _u_villa2 uuid; _u_deluxe uuid;
  _today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  _bookings int := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
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
  DELETE FROM public.pricing_rules WHERE property_id = _prop;
  DELETE FROM public.units WHERE property_id = _prop;
  DELETE FROM public.unit_groups WHERE property_id = _prop;

  -- Seed groups
  INSERT INTO public.unit_groups (property_id, name) VALUES (_prop, 'SB Superior Single') RETURNING id INTO _grp_single;
  INSERT INTO public.unit_groups (property_id, name) VALUES (_prop, 'SB Sea View Villa') RETURNING id INTO _grp_villa;
  INSERT INTO public.unit_groups (property_id, name) VALUES (_prop, 'SB Deluxe Twin') RETURNING id INTO _grp_deluxe;

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
    -- 1. Checked-in guest, current room free after checkout -> clean extension
    (_prop, _u_single1, 'checked_in', _today - 2, _today + 2, 1, 4000,
      'SB Somchai Extend', 'sandbox+extend@example.test', '+66900000001',
      'SANDBOX: extension possible in same room', false),
    -- 2. Checked-in guest whose room is booked right after -> extension needs a move
    (_prop, _u_villa1, 'checked_in', _today - 1, _today + 2, 2, 5400,
      'SB Anna Blocked', 'sandbox+blocked@example.test', '+66900000002',
      'SANDBOX: room booked immediately after -> must relocate to extend', false),
    -- 3. Blocker for scenario 2
    (_prop, _u_villa1, 'confirmed', _today + 2, _today + 6, 2, 7200,
      'SB Blocker Booking', 'sandbox+blocker@example.test', '+66900000003',
      'SANDBOX: blocks Villa 1 to force a relocation', false),
    -- 4. Confirmed upgrade candidate
    (_prop, _u_deluxe, 'confirmed', _today + 3, _today + 8, 2, 7000,
      'SB Upgrade Candidate', 'sandbox+upgrade@example.test', '+66900000004',
      'SANDBOX: upgrade / downgrade practice', false),
    -- 5. Pay on arrival, checked in
    (_prop, _u_single2, 'checked_in', _today, _today + 3, 1, 3000,
      'SB Pay On Arrival', 'sandbox+poa@example.test', '+66900000005',
      'SANDBOX: pay-on-arrival, should not show as overdue', true),
    -- 6. Stay crossing month end
    (_prop, _u_villa2, 'confirmed', (date_trunc('month', _today) + interval '1 month - 2 days')::date,
      (date_trunc('month', _today) + interval '1 month 3 days')::date, 3, 9000,
      'SB Month Crosser', 'sandbox+month@example.test', '+66900000006',
      'SANDBOX: stay crosses month boundary', false);

  SELECT count(*) INTO _bookings FROM public.bookings WHERE property_id = _prop;

  RETURN jsonb_build_object(
    'property_id', _prop,
    'units', 5,
    'groups', 3,
    'bookings', _bookings,
    'reset_at', now()
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.reset_sandbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_sandbox() TO authenticated;