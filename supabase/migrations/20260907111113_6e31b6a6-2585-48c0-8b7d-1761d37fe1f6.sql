CREATE OR REPLACE FUNCTION public.swap_booking_rooms(_booking_a uuid, _booking_b uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
  b RECORD;
  unit_a RECORD;
  unit_b RECORD;
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  IF NOT (public.has_role(actor, 'admin')
       OR public.has_role(actor, 'manager')
       OR public.has_role(actor, 'front_desk_supervisor')
       OR public.has_role(actor, 'front_desk')) THEN
    RAISE EXCEPTION 'You do not have permission to move bookings';
  END IF;

  IF _booking_a = _booking_b THEN
    RAISE EXCEPTION 'Pick two different bookings';
  END IF;

  SELECT id, unit_id, check_in, check_out, state, property_id
    INTO a FROM public.bookings WHERE id = _booking_a FOR UPDATE;
  SELECT id, unit_id, check_in, check_out, state, property_id
    INTO b FROM public.bookings WHERE id = _booking_b FOR UPDATE;

  IF a.id IS NULL OR b.id IS NULL THEN
    RAISE EXCEPTION 'One of the bookings could not be found';
  END IF;
  IF a.unit_id IS NULL OR b.unit_id IS NULL THEN
    RAISE EXCEPTION 'Both bookings must already have a room';
  END IF;
  IF a.unit_id = b.unit_id THEN
    RAISE EXCEPTION 'Both bookings are already in the same room';
  END IF;
  IF a.state IN ('cancelled','completed','no_show') OR b.state IN ('cancelled','completed','no_show') THEN
    RAISE EXCEPTION 'Only active bookings can be swapped';
  END IF;

  SELECT id, name, is_active INTO unit_a FROM public.units WHERE id = a.unit_id;
  SELECT id, name, is_active INTO unit_b FROM public.units WHERE id = b.unit_id;

  IF NOT coalesce(unit_a.is_active, false) OR NOT coalesce(unit_b.is_active, false) THEN
    RAISE EXCEPTION 'One of the rooms is out of service';
  END IF;

  -- Third-party bookings standing in the way of either leg of the swap.
  IF EXISTS (
    SELECT 1 FROM public.bookings o
    WHERE o.id NOT IN (a.id, b.id)
      AND o.state IN ('inquiry','soft_hold','pending_approval','pending_deposit','confirmed','checked_in')
      AND ((o.unit_id = b.unit_id AND o.check_in < a.check_out AND o.check_out > a.check_in)
        OR (o.unit_id = a.unit_id AND o.check_in < b.check_out AND o.check_out > b.check_in))
  ) THEN
    RAISE EXCEPTION 'Another booking already occupies one of these rooms for part of those dates';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_segments s
    JOIN public.bookings ob ON ob.id = s.booking_id
    WHERE s.booking_id NOT IN (a.id, b.id)
      AND s.status IN ('active','pending')
      AND ob.state IN ('inquiry','soft_hold','pending_approval','pending_deposit','confirmed','checked_in')
      AND ((s.unit_id = b.unit_id AND s.starts_on < a.check_out AND s.ends_on > a.check_in)
        OR (s.unit_id = a.unit_id AND s.starts_on < b.check_out AND s.ends_on > b.check_in))
  ) THEN
    RAISE EXCEPTION 'Another booking already occupies one of these rooms for part of those dates';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.maintenance_blocks mb
    WHERE (mb.unit_id = b.unit_id AND mb.start_date < a.check_out AND mb.end_date > a.check_in)
       OR (mb.unit_id = a.unit_id AND mb.start_date < b.check_out AND mb.end_date > b.check_in)
  ) THEN
    RAISE EXCEPTION 'One of the rooms is blocked for maintenance during those dates';
  END IF;

  -- Park booking B's inventory legs so booking A can take its room, then swap.
  UPDATE public.booking_segments SET status = 'released'
   WHERE booking_id = b.id AND status IN ('active','pending');

  UPDATE public.booking_segments SET unit_id = unit_b.id
   WHERE booking_id = a.id AND status IN ('active','pending');

  UPDATE public.booking_segments SET unit_id = unit_a.id, status = 'active'
   WHERE booking_id = b.id AND status = 'released';

  UPDATE public.bookings SET unit_id = unit_b.id WHERE id = a.id;
  UPDATE public.bookings SET unit_id = unit_a.id WHERE id = b.id;

  INSERT INTO public.override_audit_log (
    action_type, target_type, target_id, booking_id, room_id,
    before_state, after_state, reason, metadata, actor_id
  ) VALUES (
    'booking_rooms_swapped', 'booking', a.id, a.id, unit_b.id,
    jsonb_build_object('booking_a_unit', unit_a.name, 'booking_b_unit', unit_b.name),
    jsonb_build_object('booking_a_unit', unit_b.name, 'booking_b_unit', unit_a.name),
    nullif(btrim(coalesce(_reason,'')), ''),
    jsonb_build_object('booking_a', a.id, 'booking_b', b.id,
                       'unit_a', unit_a.id, 'unit_b', unit_b.id,
                       'source', 'room_swap'),
    actor
  );

  RETURN jsonb_build_object(
    'ok', true,
    'booking_a', jsonb_build_object('id', a.id, 'unit_id', unit_b.id, 'unit_name', unit_b.name),
    'booking_b', jsonb_build_object('id', b.id, 'unit_id', unit_a.id, 'unit_name', unit_a.name)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.swap_booking_rooms(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.swap_booking_rooms(uuid, uuid, text) TO authenticated;