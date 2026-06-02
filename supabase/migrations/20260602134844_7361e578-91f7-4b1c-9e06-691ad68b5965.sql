ALTER TABLE public.vanta_integration_session
  ALTER COLUMN identity_strategy SET DEFAULT 'vanta_owner';

ALTER TABLE public.vanta_integration_session
  DROP CONSTRAINT IF EXISTS vanta_owner_strategy_requires_identifier;

UPDATE public.vanta_integration_session
SET identity_strategy = 'vanta_owner',
    enabled = false,
    status = 'needs_setup',
    failure_count = 0,
    last_failure_at = NULL,
    last_error_summary = 'Vanta owner identifier required before sending outbound signals',
    last_response_code = NULL,
    last_response_snippet = NULL
WHERE NULLIF(BTRIM(COALESCE(vanta_owner_identifier, '')), '') IS NULL;

ALTER TABLE public.vanta_integration_session
  ADD CONSTRAINT vanta_owner_enabled_requires_identifier
  CHECK (
    NOT enabled
    OR identity_strategy <> 'vanta_owner'
    OR NULLIF(BTRIM(COALESCE(vanta_owner_identifier, '')), '') IS NOT NULL
  );