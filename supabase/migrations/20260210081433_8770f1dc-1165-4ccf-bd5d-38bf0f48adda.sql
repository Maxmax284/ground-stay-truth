
-- Allow guests to create booking inquiries
CREATE POLICY "Guests can create booking inquiries"
ON public.bookings
FOR INSERT
WITH CHECK (guest_id = auth.uid() AND state = 'inquiry'::booking_state);

-- Allow guests to cancel their own bookings
CREATE POLICY "Guests can cancel own bookings"
ON public.bookings
FOR UPDATE
USING (guest_id = auth.uid())
WITH CHECK (guest_id = auth.uid() AND state = 'cancelled'::booking_state);

-- Allow guests to insert booking state log entries for their own bookings
CREATE POLICY "Guests can log own booking state changes"
ON public.booking_state_log
FOR INSERT
WITH CHECK (
  changed_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.bookings
    WHERE bookings.id = booking_state_log.booking_id
    AND bookings.guest_id = auth.uid()
  )
);

-- Allow guests to upload their own documents
CREATE POLICY "Guests can upload own documents"
ON public.guest_documents
FOR INSERT
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.bookings
    WHERE bookings.id = guest_documents.booking_id
    AND bookings.guest_id = auth.uid()
  )
);

-- Allow guests to view their own documents
CREATE POLICY "Guests can view own documents"
ON public.guest_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.bookings
    WHERE bookings.id = guest_documents.booking_id
    AND bookings.guest_id = auth.uid()
  )
);
