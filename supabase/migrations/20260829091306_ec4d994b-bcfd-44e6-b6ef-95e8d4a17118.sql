CREATE OR REPLACE FUNCTION public.trg_audit_staff_booking_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_name text;
  guest_name text;
BEGIN
  -- Only log when an authenticated staff member created the booking.
  IF actor IS NULL OR (NEW.guest_id IS NOT NULL AND NEW.guest_id = actor) THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_ops_write(actor) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, email, 'Staff member')
    INTO actor_name
  FROM public.profiles
  WHERE user_id = actor
  LIMIT 1;

  SELECT COALESCE(
      NULLIF(trim(NEW.manual_guest_name), ''),
      NULLIF(trim(p.full_name), ''),
      NULLIF(trim(NEW.manual_guest_email), ''),
      NULLIF(trim(p.email), ''),
      'Guest'
    )
    INTO guest_name
  FROM (SELECT 1) AS seed
  LEFT JOIN public.profiles p ON p.user_id = NEW.guest_id;

  PERFORM public.log_staff_audit_event(
    'booking_created_by_staff',
    'info',
    actor,
    NEW.guest_id,
    format('Booking created manually for %s', guest_name),
    jsonb_build_object(
      'booking_id', NEW.id,
      'property_id', NEW.property_id,
      'unit_id', NEW.unit_id,
      'guest_name', guest_name,
      'state', NEW.state,
      'check_in', NEW.check_in,
      'check_out', NEW.check_out,
      'total_price', NEW.total_price
    )
  );

  PERFORM public.emit_admin_alert(
    'booking_created_by_staff',
    format('%s created a booking for %s (%s to %s)',
      COALESCE(actor_name, 'Staff member'),
      guest_name,
      NEW.check_in,
      NEW.check_out),
    NEW.id,
    '/bookings?id=' || NEW.id::text,
    jsonb_build_object(
      'booking_id', NEW.id,
      'actor_id', actor,
      'actor_name', actor_name,
      'guest_name', guest_name,
      'state', NEW.state,
      'total_price', NEW.total_price
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_audit_staff_booking_created: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_audit_staff_booking_created() FROM anon, authenticated, PUBLIC;