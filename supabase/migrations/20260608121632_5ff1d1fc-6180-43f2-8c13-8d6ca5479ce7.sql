
-- Phase 1: unify blocking states in the overlap trigger (include 'inquiry')
CREATE OR REPLACE FUNCTION public.check_booking_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.state IN ('inquiry', 'soft_hold', 'pending_approval', 'pending_deposit', 'confirmed', 'checked_in') THEN
    IF EXISTS (
      SELECT 1 FROM public.bookings
      WHERE unit_id = NEW.unit_id
        AND id != NEW.id
        AND state IN ('inquiry', 'soft_hold', 'pending_approval', 'pending_deposit', 'confirmed', 'checked_in')
        AND check_in < NEW.check_out
        AND check_out > NEW.check_in
    ) THEN
      RAISE EXCEPTION 'Booking dates overlap with an existing booking for this unit'
        USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Phase 2: atomic, race-free room allocation within a unit_group
-- Returns the chosen unit_id (or NULL if no rooms are available).
-- Uses FOR UPDATE SKIP LOCKED so two concurrent callers cannot lock the same row.
CREATE OR REPLACE FUNCTION public.assign_unit_for_group(
  _group_id uuid,
  _check_in date,
  _check_out date
)
RETURNS TABLE(unit_id uuid, unit_name text, available_count int, total_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _picked_id uuid;
  _picked_name text;
  _total int;
  _avail int;
BEGIN
  IF _group_id IS NULL OR _check_in IS NULL OR _check_out IS NULL OR _check_out <= _check_in THEN
    RAISE EXCEPTION 'invalid arguments to assign_unit_for_group';
  END IF;

  SELECT count(*) INTO _total
  FROM public.units u
  WHERE u.group_id = _group_id AND u.is_active;

  -- Compute how many sibling units are currently free (informational).
  SELECT count(*) INTO _avail
  FROM public.units u
  WHERE u.group_id = _group_id
    AND u.is_active
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.unit_id = u.id
        AND b.state IN ('inquiry','soft_hold','pending_approval','pending_deposit','confirmed','checked_in')
        AND b.check_in < _check_out
        AND b.check_out > _check_in
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.maintenance_blocks m
      WHERE m.unit_id = u.id
        AND m.start_date < _check_out
        AND m.end_date > _check_in
    );

  -- Pick + lock the first free sibling by sort_order.
  SELECT u.id, u.name
  INTO _picked_id, _picked_name
  FROM public.units u
  WHERE u.group_id = _group_id
    AND u.is_active
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.unit_id = u.id
        AND b.state IN ('inquiry','soft_hold','pending_approval','pending_deposit','confirmed','checked_in')
        AND b.check_in < _check_out
        AND b.check_out > _check_in
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.maintenance_blocks m
      WHERE m.unit_id = u.id
        AND m.start_date < _check_out
        AND m.end_date > _check_in
    )
  ORDER BY u.sort_order NULLS LAST, u.created_at
  FOR UPDATE OF u SKIP LOCKED
  LIMIT 1;

  RETURN QUERY SELECT _picked_id, _picked_name, _avail, _total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_unit_for_group(uuid, date, date) TO authenticated, anon, service_role;
