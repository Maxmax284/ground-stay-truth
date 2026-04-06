DROP POLICY IF EXISTS "System can insert profile audit log" ON public.profile_audit_log;

-- The log_profile_changes trigger uses SECURITY DEFINER so it bypasses RLS.
-- This policy allows authenticated users to insert only their own audit entries as a safety net.
CREATE POLICY "Users can insert own profile audit"
  ON public.profile_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (profile_user_id = auth.uid());