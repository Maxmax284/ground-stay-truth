
-- Tighten guest intelligence read policy: require an active booking
DROP POLICY IF EXISTS "Guests can read active guest intelligence" ON public.intelligence_entries;

CREATE POLICY "Guests with active booking can read guest intelligence"
ON public.intelligence_entries
FOR SELECT
TO authenticated
USING (
  status = 'active'
  AND 'guest' = ANY(audience)
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.guest_id = auth.uid()
      AND b.state IN ('confirmed','checked_in')
      AND (intelligence_entries.property_id IS NULL OR b.property_id = intelligence_entries.property_id)
  )
);
