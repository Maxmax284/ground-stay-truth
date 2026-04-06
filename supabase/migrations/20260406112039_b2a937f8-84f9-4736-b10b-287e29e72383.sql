-- Add RLS policies to profile_audit_log
CREATE POLICY "Admins can read profile audit log"
  ON public.profile_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert profile audit log"
  ON public.profile_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);