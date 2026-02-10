
-- Add verification columns to guest_documents
ALTER TABLE public.guest_documents
  ADD COLUMN verification_status text,
  ADD COLUMN verification_notes jsonb,
  ADD COLUMN verified_at timestamptz;

-- Allow staff to update verification columns (edge function uses service role, but staff may need read access)
CREATE POLICY "Staff can update guest document verification"
  ON public.guest_documents
  FOR UPDATE
  USING (has_role(auth.uid(), 'front_desk'::app_role))
  WITH CHECK (has_role(auth.uid(), 'front_desk'::app_role));

-- Admin full access already covers updates via ALL policy
