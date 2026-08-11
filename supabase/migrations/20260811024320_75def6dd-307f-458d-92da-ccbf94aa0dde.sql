CREATE TABLE public.ai_action_drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by_user_id uuid,
  action_type text NOT NULL,
  summary text NOT NULL,
  rationale text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  booking_id uuid,
  property_id uuid,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_action_drafts_status_check
    CHECK (status = ANY (ARRAY['pending','approved','rejected','applied','expired']))
);

CREATE INDEX idx_ai_drafts_status ON public.ai_action_drafts (status, created_at DESC);
CREATE INDEX idx_ai_drafts_booking ON public.ai_action_drafts (booking_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.ai_action_drafts TO authenticated;
GRANT ALL ON public.ai_action_drafts TO service_role;

ALTER TABLE public.ai_action_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ops staff read AI drafts"
ON public.ai_action_drafts FOR SELECT TO authenticated
USING (public.has_ops_read(auth.uid()));

CREATE POLICY "Ops staff create AI drafts"
ON public.ai_action_drafts FOR INSERT TO authenticated
WITH CHECK (public.has_ops_read(auth.uid()));

CREATE POLICY "Ops staff review AI drafts"
ON public.ai_action_drafts FOR UPDATE TO authenticated
USING (public.has_ops_write(auth.uid()))
WITH CHECK (public.has_ops_write(auth.uid()));