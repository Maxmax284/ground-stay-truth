
CREATE TABLE public.recovery_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_role TEXT,
  action TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  outcome TEXT NOT NULL DEFAULT 'success',
  details JSONB DEFAULT '{}'::jsonb,
  failure_reason TEXT
);

ALTER TABLE public.recovery_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read recovery audit log"
  ON public.recovery_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert recovery audit log"
  ON public.recovery_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
