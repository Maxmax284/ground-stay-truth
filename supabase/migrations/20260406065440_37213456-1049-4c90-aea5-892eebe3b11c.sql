
-- F-02/F-03: Create user_consents table for GDPR consent tracking
CREATE TABLE public.user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  consent_type text NOT NULL,
  policy_version text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

-- Users can read their own consents
CREATE POLICY "Users can read own consents"
  ON public.user_consents FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can insert own consents
CREATE POLICY "Users can insert own consents"
  ON public.user_consents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admins can read all consents (for DSAR compliance)
CREATE POLICY "Admins can read all consents"
  ON public.user_consents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-record consent on new user signup via trigger
CREATE OR REPLACE FUNCTION public.auto_record_signup_consent()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.user_consents (user_id, consent_type, policy_version)
  VALUES (NEW.id, 'privacy_policy', '2026-02');
  INSERT INTO public.user_consents (user_id, consent_type, policy_version)
  VALUES (NEW.id, 'terms_of_service', '2026-02');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_consent
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_record_signup_consent();
