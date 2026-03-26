ALTER TABLE public.airport_pickups ADD COLUMN guest_landed_at timestamptz DEFAULT NULL;

-- Allow guests to update guest_landed_at on their own pickups
CREATE POLICY "Guests can confirm landing on own pickups"
ON public.airport_pickups
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM bookings
    WHERE bookings.id = airport_pickups.booking_id
    AND bookings.guest_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM bookings
    WHERE bookings.id = airport_pickups.booking_id
    AND bookings.guest_id = auth.uid()
  )
);