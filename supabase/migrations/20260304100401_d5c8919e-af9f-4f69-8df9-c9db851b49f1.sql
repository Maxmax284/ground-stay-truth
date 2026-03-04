
-- Add draft and approved_by columns to messages table
ALTER TABLE public.messages ADD COLUMN draft boolean NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD COLUMN approved_by uuid;

-- Update guest SELECT policy to only show non-draft messages
DROP POLICY IF EXISTS "Guests can read non-internal messages on own bookings" ON public.messages;
CREATE POLICY "Guests can read non-internal messages on own bookings"
ON public.messages
FOR SELECT
USING (
  (is_internal = false)
  AND (draft = false)
  AND (booking_id IN (
    SELECT bookings.id FROM bookings WHERE bookings.guest_id = auth.uid()
  ))
);
