-- 1. Allow ops-write staff to create bookings, scoped to their assigned properties
CREATE POLICY "Staff can create bookings"
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_ops_write(auth.uid())
  AND (
    property_id IS NULL
    OR public.has_property_access(auth.uid(), property_id)
  )
);

-- 2. Audit trail + admin/manager alert for staff-created bookings
CREATE OR REPLACE FUNCTION public.trg_audit_staff_booking_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_name text;
BEGIN
  -- Only log when a staff member (not the guest themselves) created the booking
  IF actor IS NULL OR (NEW.guest_id IS NOT NULL AND NEW.guest_id = actor) THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_ops_write(actor) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, email, 'Staff member') INTO actor_name
  FROM public.profiles WHERE id = actor;

  PERFORM public.log_staff_audit_event(
    'booking_created_by_staff',
    'info',
    actor,
    NEW.guest_id,
    format('Booking created manually for %s', COALESCE(NEW.guest_name, 'guest')),
    jsonb_build_object(
      'booking_id', NEW.id,
      'property_id', NEW.property_id,
      'unit_id', NEW.unit_id,
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
      COALESCE(NEW.guest_name, 'guest'),
      NEW.check_in, NEW.check_out),
    NEW.id,
    '/bookings',
    jsonb_build_object(
      'booking_id', NEW.id,
      'actor_id', actor,
      'actor_name', actor_name,
      'state', NEW.state,
      'total_price', NEW.total_price
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_staff_booking_created ON public.bookings;
CREATE TRIGGER trg_audit_staff_booking_created
AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_staff_booking_created();
