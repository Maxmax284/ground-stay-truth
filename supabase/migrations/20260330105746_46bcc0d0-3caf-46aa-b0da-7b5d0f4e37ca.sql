
-- Flight tracking cache table
CREATE TABLE public.flight_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_id uuid REFERENCES public.airport_pickups(id) ON DELETE CASCADE NOT NULL,
  flight_number text NOT NULL,
  airline_name text,
  departure_airport text,
  departure_iata text,
  arrival_airport text,
  arrival_iata text,
  scheduled_departure timestamptz,
  estimated_departure timestamptz,
  actual_departure timestamptz,
  scheduled_arrival timestamptz,
  estimated_arrival timestamptz,
  actual_arrival timestamptz,
  flight_status text NOT NULL DEFAULT 'unknown',
  delay_minutes integer DEFAULT 0,
  terminal text,
  gate text,
  raw_response jsonb DEFAULT '{}'::jsonb,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pickup_id)
);

-- Enable RLS
ALTER TABLE public.flight_tracking ENABLE ROW LEVEL SECURITY;

-- Staff can read flight tracking data
CREATE POLICY "Staff can read flight tracking"
ON public.flight_tracking FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'front_desk'::app_role)
);

-- Admins can manage flight tracking
CREATE POLICY "Admins can manage flight tracking"
ON public.flight_tracking FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Managers can manage flight tracking
CREATE POLICY "Managers can manage flight tracking"
ON public.flight_tracking FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

-- Guests can read their own flight tracking
CREATE POLICY "Guests can read own flight tracking"
ON public.flight_tracking FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.airport_pickups ap
    JOIN public.bookings b ON b.id = ap.booking_id
    WHERE ap.id = flight_tracking.pickup_id
    AND b.guest_id = auth.uid()
  )
);

-- Updated at trigger
CREATE TRIGGER update_flight_tracking_updated_at
  BEFORE UPDATE ON public.flight_tracking
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
