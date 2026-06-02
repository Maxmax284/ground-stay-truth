ALTER TABLE public.vanta_integration_session
  ADD COLUMN IF NOT EXISTS vanta_owner_identifier TEXT,
  ADD COLUMN IF NOT EXISTS identity_strategy TEXT NOT NULL DEFAULT 'vanta_owner' CHECK (identity_strategy IN ('vanta_owner', 'payload_user'));

UPDATE public.vanta_integration_session
SET identity_strategy = 'vanta_owner'
WHERE identity_strategy IS NULL;