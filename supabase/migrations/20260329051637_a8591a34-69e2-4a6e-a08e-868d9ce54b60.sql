-- Tighten security_events INSERT policy to staff-only
DROP POLICY IF EXISTS "Service can insert security events" ON public.security_events;

CREATE POLICY "Authenticated users can insert security events"
  ON public.security_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);