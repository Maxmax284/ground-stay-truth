DROP POLICY "Staff read pickup messages" ON public.pickup_driver_messages;
DROP POLICY "Staff send pickup messages" ON public.pickup_driver_messages;
DROP POLICY "Staff mark pickup messages read" ON public.pickup_driver_messages;

CREATE POLICY "Property staff read pickup messages"
ON public.pickup_driver_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.airport_pickups ap
    WHERE ap.id = pickup_driver_messages.pickup_id
      AND public.has_property_access(auth.uid(), ap.property_id)
  )
  AND (
    public.has_role(auth.uid(), 'front_desk')
    OR public.has_role(auth.uid(), 'front_desk_supervisor')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Property staff send pickup messages"
ON public.pickup_driver_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_type = 'staff'
  AND sender_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.airport_pickups ap
    WHERE ap.id = pickup_driver_messages.pickup_id
      AND ap.booking_id = pickup_driver_messages.booking_id
      AND public.has_property_access(auth.uid(), ap.property_id)
  )
  AND (
    public.has_role(auth.uid(), 'front_desk')
    OR public.has_role(auth.uid(), 'front_desk_supervisor')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Property staff mark pickup messages read"
ON public.pickup_driver_messages FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.airport_pickups ap
    WHERE ap.id = pickup_driver_messages.pickup_id
      AND public.has_property_access(auth.uid(), ap.property_id)
  )
  AND (
    public.has_role(auth.uid(), 'front_desk')
    OR public.has_role(auth.uid(), 'front_desk_supervisor')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.airport_pickups ap
    WHERE ap.id = pickup_driver_messages.pickup_id
      AND public.has_property_access(auth.uid(), ap.property_id)
  )
  AND (
    public.has_role(auth.uid(), 'front_desk')
    OR public.has_role(auth.uid(), 'front_desk_supervisor')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'admin')
  )
);