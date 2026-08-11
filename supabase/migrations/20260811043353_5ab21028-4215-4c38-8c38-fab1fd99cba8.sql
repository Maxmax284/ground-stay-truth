-- MFA policy seeds (global scope). Admin-level MFA is required; manager and
-- below are opt-in. Trust window default: 12 hours.
INSERT INTO public.policy_settings (key, value, description)
SELECT v.key, v.value, v.description
FROM (VALUES
  ('mfa_required_admin', 'true'::jsonb, 'Require MFA for admin/owner accounts (cannot be disabled)'),
  ('mfa_required_manager', 'false'::jsonb, 'Require MFA for manager accounts'),
  ('mfa_required_staff', 'false'::jsonb, 'Require MFA for all other staff roles'),
  ('mfa_required_sensitive_actions', 'true'::jsonb, 'Require a fresh MFA check before refunds, role changes and security settings'),
  ('mfa_grace_period_days', '7'::jsonb, 'Days a newly created required-MFA account may sign in before enrollment is enforced'),
  ('mfa_trust_window_hours', '12'::jsonb, 'Hours a verified device/session stays trusted before MFA is requested again')
) AS v(key, value, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.policy_settings p WHERE p.key = v.key AND p.property_id IS NULL
);

-- Admin MFA is always required, regardless of stored value.
UPDATE public.policy_settings SET value = 'true'::jsonb
WHERE key = 'mfa_required_admin' AND property_id IS NULL AND value <> 'true'::jsonb;

-- Single-use, hashed MFA recovery codes. Plaintext never touches the database.
CREATE TABLE IF NOT EXISTS public.mfa_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mfa_backup_codes_user_idx ON public.mfa_backup_codes(user_id) WHERE used_at IS NULL;

-- No client role may read or write hashes; only edge functions (service role).
GRANT ALL ON public.mfa_backup_codes TO service_role;
ALTER TABLE public.mfa_backup_codes ENABLE ROW LEVEL SECURITY;

-- Deliberately no policies for anon/authenticated: the table is server-only.

-- Remaining-code count for the signed-in user, without exposing hashes.
CREATE OR REPLACE FUNCTION public.mfa_backup_codes_remaining()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.mfa_backup_codes
  WHERE user_id = auth.uid() AND used_at IS NULL
$$;

REVOKE ALL ON FUNCTION public.mfa_backup_codes_remaining() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_backup_codes_remaining() TO authenticated, service_role;