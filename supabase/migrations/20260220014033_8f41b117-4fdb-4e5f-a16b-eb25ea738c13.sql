-- Gap 5: Tighten stay_support_log INSERT policy
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can insert stay support log" ON public.stay_support_log;

-- Guests can only insert for their own bookings
CREATE POLICY "Guests can insert own stay support log"
ON public.stay_support_log
FOR INSERT
TO authenticated
WITH CHECK (
  changed_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.bookings
    WHERE bookings.id = stay_support_log.booking_id
      AND bookings.guest_id = auth.uid()
  )
);

-- Staff (front_desk+) can insert for any booking
CREATE POLICY "Staff can insert stay support log"
ON public.stay_support_log
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'front_desk'::app_role)
);