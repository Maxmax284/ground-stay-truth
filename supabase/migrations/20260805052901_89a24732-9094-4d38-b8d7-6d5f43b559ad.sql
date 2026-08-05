-- 1) Guest booking cancellation: lock all columns except state
CREATE OR REPLACE FUNCTION public.guard_guest_booking_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Staff bypass entirely
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
     OR public.has_role(auth.uid(), 'front_desk_supervisor') OR public.has_role(auth.uid(), 'front_desk')
     OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only the owning guest reaches here
  IF OLD.guest_id IS NOT NULL AND OLD.guest_id = auth.uid() THEN
    IF NEW.state <> 'cancelled'::booking_state THEN
      RAISE EXCEPTION 'Guests may only cancel their own booking';
    END IF;

    -- Freeze every other column back to its stored value
    NEW.id := OLD.id;
    NEW.guest_id := OLD.guest_id;
    NEW.unit_id := OLD.unit_id;
    NEW.property_id := OLD.property_id;
    NEW.check_in := OLD.check_in;
    NEW.check_out := OLD.check_out;
    NEW.num_guests := OLD.num_guests;
    NEW.total_price := OLD.total_price;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    NEW.confirmation_number := OLD.confirmation_number;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_guest_booking_update ON public.bookings;
CREATE TRIGGER trg_guard_guest_booking_update
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.guard_guest_booking_update();

-- 2) Airport pickups: guests may only confirm landing / flight details
CREATE OR REPLACE FUNCTION public.guard_guest_pickup_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_guest boolean;
BEGIN
  IF auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
     OR public.has_role(auth.uid(), 'front_desk_supervisor') OR public.has_role(auth.uid(), 'front_desk') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = OLD.booking_id AND b.guest_id = auth.uid()
  ) INTO _is_guest;

  IF _is_guest THEN
    -- Allow only landing confirmation fields; restore everything else
    NEW.id := OLD.id;
    NEW.booking_id := OLD.booking_id;
    NEW.property_id := OLD.property_id;
    NEW.driver_id := OLD.driver_id;
    NEW.status := OLD.status;
    NEW.fee := OLD.fee;
    NEW.fee_override := OLD.fee_override;
    NEW.fee_override_reason := OLD.fee_override_reason;
    NEW.fee_override_by := OLD.fee_override_by;
    NEW.pickup_enabled := OLD.pickup_enabled;
    NEW.assigned_by := OLD.assigned_by;
    NEW.assigned_at := OLD.assigned_at;
    NEW.confirmed_at := OLD.confirmed_at;
    NEW.completed_at := OLD.completed_at;
    NEW.completed_by := OLD.completed_by;
    NEW.assist_mode := OLD.assist_mode;
    NEW.assist_reason := OLD.assist_reason;
    NEW.assist_activated_at := OLD.assist_activated_at;
    NEW.assist_activated_by := OLD.assist_activated_by;
    NEW.assist_resolved_at := OLD.assist_resolved_at;
    NEW.assist_resolved_by := OLD.assist_resolved_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_guest_pickup_update ON public.airport_pickups;
CREATE TRIGGER trg_guard_guest_pickup_update
BEFORE UPDATE ON public.airport_pickups
FOR EACH ROW EXECUTE FUNCTION public.guard_guest_pickup_update();

-- 3) Pricing rules: public feed limited to current/future windows only
DROP POLICY IF EXISTS "Public can read pricing rules" ON public.pricing_rules;
CREATE POLICY "Public can read current pricing rules"
ON public.pricing_rules
FOR SELECT
TO anon, authenticated
USING (end_date IS NULL OR end_date >= (CURRENT_DATE - INTERVAL '1 day'));

-- 4) Internal helper functions: fixed search_path + no public/guest EXECUTE
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;

REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.email_queue_dispatch() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.increment_payment_event_retry(text, text) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_link_codes() FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_payment_event_retry(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_link_codes() TO service_role;

-- Anonymous callers never need these; signed-in staff still do (function bodies role-check)
REVOKE ALL ON FUNCTION public.emit_admin_alert(text, text, uuid, text, jsonb) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.merge_guest_records(text, text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.get_guest_directory() FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.get_guest_bookings(text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.get_booking_operational_timeline(uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.get_ops_exceptions() FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.get_ops_service_health() FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.get_unit_essentials(uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.is_secret_configured(text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_guest_documents(uuid) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.merge_guest_records(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_guest_directory() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_guest_bookings(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_booking_operational_timeline(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ops_exceptions() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ops_service_health() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_unit_essentials(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_secret_configured(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_guest_documents(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.emit_admin_alert(text, text, uuid, text, jsonb) TO service_role;