-- Guests may read the driver assigned to their own active airport pickup so the
-- post-landing handshake (name, plate, vehicle) renders on their phone.
CREATE POLICY "Guests can read their assigned driver"
  ON public.drivers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.airport_pickups ap
      JOIN public.bookings b ON b.id = ap.booking_id
      WHERE ap.driver_id = drivers.id
        AND b.guest_id = auth.uid()
        AND ap.status NOT IN ('cancelled')
    )
  );