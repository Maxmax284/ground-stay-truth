CREATE TABLE public.trusted_devices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_key text NOT NULL,
  label text NOT NULL DEFAULT 'Unknown device',
  device_type text NOT NULL DEFAULT 'browser' CHECK (device_type IN ('laptop','desktop','phone','tablet','browser','unknown')),
  browser text,
  os text,
  user_agent text,
  ip_address text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('trusted','pending','revoked','blocked')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  last_mfa_verified_at timestamptz,
  expires_at timestamptz,
  is_sandbox boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_key)
);

CREATE INDEX idx_trusted_devices_user ON public.trusted_devices (user_id, last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trusted_devices TO authenticated;
GRANT ALL ON public.trusted_devices TO service_role;

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.device_self_approval_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (value #>> '{}')::boolean
       FROM public.policy_settings
      WHERE key = 'device_self_approval' AND property_id IS NULL
      LIMIT 1),
    true
  );
$$;

CREATE POLICY "Users read own devices"
ON public.trusted_devices FOR SELECT TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users register own device"
ON public.trusted_devices FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND status <> 'trusted');

CREATE POLICY "Users update own device"
ON public.trusted_devices FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND (status <> 'trusted' OR public.device_self_approval_allowed())
);

CREATE POLICY "Admins manage other users devices"
ON public.trusted_devices FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND user_id <> auth.uid())
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND user_id <> auth.uid());

CREATE POLICY "Owner or admin removes devices"
ON public.trusted_devices FOR DELETE TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_trusted_devices_updated_at
BEFORE UPDATE ON public.trusted_devices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();