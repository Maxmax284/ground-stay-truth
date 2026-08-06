ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS pay_on_arrival boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offline_acknowledgements jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.guard_guest_booking_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
     OR public.has_role(auth.uid(), 'front_desk_supervisor') OR public.has_role(auth.uid(), 'front_desk')
     OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.guest_id IS NOT NULL AND OLD.guest_id = auth.uid() THEN
    IF NEW.state <> 'cancelled'::booking_state THEN
      RAISE EXCEPTION 'Guests may only cancel their own booking';
    END IF;

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
    NEW.pay_on_arrival := OLD.pay_on_arrival;
    NEW.offline_acknowledgements := OLD.offline_acknowledgements;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$function$;