
CREATE OR REPLACE FUNCTION public.validate_booking_check_in_not_past()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today_bkk date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  _actor uuid := auth.uid();
  _is_staff boolean := false;
BEGIN
  -- Only guard past dates; today or future always allowed here.
  IF NEW.check_in IS NULL OR NEW.check_in >= _today_bkk THEN
    RETURN NEW;
  END IF;

  -- Determine if the acting user is authorized staff.
  IF _actor IS NOT NULL THEN
    _is_staff :=
      public.has_role(_actor, 'admin'::app_role)
      OR public.has_role(_actor, 'manager'::app_role)
      OR public.has_role(_actor, 'front_desk_supervisor'::app_role);
  END IF;

  IF NOT _is_staff THEN
    RAISE EXCEPTION 'Check-in date cannot be in the past. Please choose today or a future date.'
      USING ERRCODE = '22007';
  END IF;

  -- Staff-initiated backdated booking: log to audit trail.
  BEGIN
    PERFORM public.log_staff_audit_event(
      'booking.backdated_created',
      'warning',
      _actor,
      NEW.guest_id,
      COALESCE(NEW.notes, 'Backdated booking created by staff'),
      jsonb_build_object(
        'booking_check_in', NEW.check_in,
        'booking_check_out', NEW.check_out,
        'unit_id', NEW.unit_id,
        'today_bkk', _today_bkk,
        'source', 'staff_backdate'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'backdated booking audit log failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_no_past_check_in ON public.bookings;
CREATE TRIGGER bookings_no_past_check_in
BEFORE INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.validate_booking_check_in_not_past();
