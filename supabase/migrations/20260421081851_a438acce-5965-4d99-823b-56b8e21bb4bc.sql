-- Add flight_number to bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS flight_number text;

-- Stage log table (idempotent per booking+stage)
CREATE TABLE IF NOT EXISTS public.guest_arrival_stage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  stage text NOT NULL,
  triggered_by text NOT NULL DEFAULT 'auto',
  context jsonb DEFAULT '{}'::jsonb,
  fired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_arrival_stage_log_booking ON public.guest_arrival_stage_log(booking_id);

ALTER TABLE public.guest_arrival_stage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage arrival stage log"
ON public.guest_arrival_stage_log FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff read arrival stage log"
ON public.guest_arrival_stage_log FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'front_desk'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Guests read own arrival stage log"
ON public.guest_arrival_stage_log FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM bookings WHERE bookings.id = guest_arrival_stage_log.booking_id AND bookings.guest_id = auth.uid()));

-- Mirror flight_number from bookings to airport_pickups when one exists
CREATE OR REPLACE FUNCTION public.mirror_flight_number_to_pickup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.flight_number IS DISTINCT FROM OLD.flight_number THEN
    UPDATE public.airport_pickups
    SET flight_number = NEW.flight_number, updated_at = now()
    WHERE booking_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_flight_number ON public.bookings;
CREATE TRIGGER trg_mirror_flight_number
AFTER UPDATE OF flight_number ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.mirror_flight_number_to_pickup();

-- Trigger Stage 4 on check-in via NOTIFY (consumed by edge function)
CREATE OR REPLACE FUNCTION public.notify_booking_checked_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.state = 'checked_in' AND (OLD.state IS DISTINCT FROM NEW.state) THEN
    -- Insert stage log marker; edge function reads new rows and dispatches
    INSERT INTO public.guest_arrival_stage_log (booking_id, stage, triggered_by, context)
    VALUES (NEW.id, 'stage_4_checkin_pending', 'auto', jsonb_build_object('notes', NEW.notes))
    ON CONFLICT (booking_id, stage) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_checkin ON public.bookings;
CREATE TRIGGER trg_notify_booking_checkin
AFTER UPDATE OF state ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_booking_checked_in();