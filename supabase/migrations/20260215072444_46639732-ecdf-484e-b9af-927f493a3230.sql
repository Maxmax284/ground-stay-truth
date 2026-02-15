-- Staff can update messages (mark as read)
CREATE POLICY "Staff can update messages"
ON public.messages FOR UPDATE
USING (public.has_role(auth.uid(), 'front_desk'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'front_desk'::app_role));

-- Guests can update own booking messages (mark as read)
CREATE POLICY "Guests can update own messages read status"
ON public.messages FOR UPDATE
USING (
  is_internal = false
  AND booking_id IN (SELECT id FROM bookings WHERE guest_id = auth.uid())
)
WITH CHECK (
  is_internal = false
  AND booking_id IN (SELECT id FROM bookings WHERE guest_id = auth.uid())
);