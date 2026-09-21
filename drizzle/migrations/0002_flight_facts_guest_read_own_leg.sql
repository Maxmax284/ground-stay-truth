-- Guests must be able to read the shared flight fact behind their own leg,
-- and nothing else. Scoped strictly through their own booking.
CREATE POLICY "Guests read flight facts on own legs"
ON public.flight_facts FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.journey_legs jl
  JOIN public.bookings b ON b.id = jl.booking_id
  WHERE jl.flight_fact_id = flight_facts.id
    AND b.guest_id = auth.uid()
));