
-- Allow guests to INSERT messages on their own bookings (with is_internal = false enforced)
CREATE POLICY "Guests can send messages on their own bookings"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  is_internal = false
  AND sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.bookings
    WHERE bookings.id = messages.booking_id
      AND bookings.guest_id = auth.uid()
  )
);
