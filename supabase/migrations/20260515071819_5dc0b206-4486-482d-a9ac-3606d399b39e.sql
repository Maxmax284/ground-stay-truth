CREATE POLICY "Public can read stay_showcase config"
ON public.policy_settings
FOR SELECT
TO anon, authenticated
USING (key = 'stay_showcase');