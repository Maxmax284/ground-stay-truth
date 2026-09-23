CREATE TABLE public.pickup_driver_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_id uuid NOT NULL REFERENCES public.airport_pickups(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  driver_link_id uuid REFERENCES public.pickup_driver_links(id) ON DELETE SET NULL,
  sender_type text NOT NULL CHECK (sender_type IN ('driver', 'guest', 'staff')),
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  read_by_guest_at timestamptz,
  read_by_staff_at timestamptz,
  read_by_driver_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pickup_driver_messages_sender CHECK (
    (sender_type = 'driver' AND sender_user_id IS NULL AND driver_link_id IS NOT NULL)
    OR (sender_type IN ('guest', 'staff') AND sender_user_id IS NOT NULL)
  )
);

CREATE INDEX pickup_driver_messages_pickup_created_idx ON public.pickup_driver_messages(pickup_id, created_at);
CREATE INDEX pickup_driver_messages_booking_created_idx ON public.pickup_driver_messages(booking_id, created_at);

GRANT SELECT, INSERT, UPDATE ON public.pickup_driver_messages TO authenticated;
GRANT ALL ON public.pickup_driver_messages TO service_role;

ALTER TABLE public.pickup_driver_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guests read own pickup messages"
ON public.pickup_driver_messages FOR SELECT TO authenticated
USING (booking_id IN (SELECT id FROM public.bookings WHERE guest_id = auth.uid()));

CREATE POLICY "Guests send own pickup messages"
ON public.pickup_driver_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_type = 'guest'
  AND sender_user_id = auth.uid()
  AND booking_id IN (SELECT id FROM public.bookings WHERE guest_id = auth.uid())
  AND pickup_id IN (SELECT id FROM public.airport_pickups WHERE booking_id = pickup_driver_messages.booking_id)
);

CREATE POLICY "Guests mark own pickup messages read"
ON public.pickup_driver_messages FOR UPDATE TO authenticated
USING (booking_id IN (SELECT id FROM public.bookings WHERE guest_id = auth.uid()))
WITH CHECK (booking_id IN (SELECT id FROM public.bookings WHERE guest_id = auth.uid()));

CREATE POLICY "Staff read pickup messages"
ON public.pickup_driver_messages FOR SELECT TO authenticated
USING (public.has_ops_read(auth.uid()) OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff send pickup messages"
ON public.pickup_driver_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_type = 'staff'
  AND sender_user_id = auth.uid()
  AND (public.has_ops_write(auth.uid()) OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Staff mark pickup messages read"
ON public.pickup_driver_messages FOR UPDATE TO authenticated
USING (public.has_ops_read(auth.uid()) OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_ops_read(auth.uid()) OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.pickup_driver_messages;

COMMENT ON TABLE public.pickup_driver_messages IS 'Pickup-scoped conversation between one driver link, the booked guest, and authorized staff. Never carries financial data or booking actions.';