
CREATE TABLE public.ai_assistant_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  assistant_response_at TIMESTAMPTZ NOT NULL,
  mode TEXT,
  focus_kind TEXT,
  focus_booking_id UUID,
  uncertain BOOLEAN NOT NULL DEFAULT false,
  missing TEXT[] NOT NULL DEFAULT '{}',
  sources TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT
);

CREATE INDEX ai_assistant_audit_user_created_idx
  ON public.ai_assistant_audit (user_id, created_at DESC);
CREATE INDEX ai_assistant_audit_session_idx
  ON public.ai_assistant_audit (session_id, created_at DESC);

GRANT SELECT, INSERT ON public.ai_assistant_audit TO authenticated;
GRANT ALL ON public.ai_assistant_audit TO service_role;

ALTER TABLE public.ai_assistant_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own AI audit rows"
  ON public.ai_assistant_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own AI audit rows"
  ON public.ai_assistant_audit
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all AI audit rows"
  ON public.ai_assistant_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
