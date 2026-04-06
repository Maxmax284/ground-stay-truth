
-- F-24/F-25: Create a secure integration_secrets table
-- Secrets stored here are NEVER readable by client-side code
CREATE TABLE public.integration_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_key text NOT NULL UNIQUE,
  encrypted_value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;

-- NO select policies for authenticated users = secrets are invisible to clients
-- Only service_role (used by edge functions) can read/write this table

-- Create a helper function for edge functions to fetch a secret
CREATE OR REPLACE FUNCTION public.get_integration_secret(_key text)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
  SELECT encrypted_value FROM public.integration_secrets WHERE secret_key = _key LIMIT 1;
$$;

-- Create a helper function to check if a secret is configured (returns true/false, no value)
CREATE OR REPLACE FUNCTION public.is_secret_configured(_key text)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.integration_secrets 
    WHERE secret_key = _key AND length(encrypted_value) > 3
  );
$$;
