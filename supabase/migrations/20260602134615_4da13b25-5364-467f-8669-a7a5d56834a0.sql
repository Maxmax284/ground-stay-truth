ALTER TABLE public.vanta_integration_session
  ALTER COLUMN identity_strategy SET DEFAULT 'payload_user';

UPDATE public.vanta_integration_session
SET identity_strategy = 'payload_user'
WHERE identity_strategy = 'vanta_owner'
  AND NULLIF(BTRIM(COALESCE(vanta_owner_identifier, '')), '') IS NULL;

ALTER TABLE public.vanta_integration_session
  DROP CONSTRAINT IF EXISTS vanta_owner_strategy_requires_identifier;

ALTER TABLE public.vanta_integration_session
  ADD CONSTRAINT vanta_owner_strategy_requires_identifier
  CHECK (
    identity_strategy <> 'vanta_owner'
    OR NULLIF(BTRIM(COALESCE(vanta_owner_identifier, '')), '') IS NOT NULL
  );

UPDATE public.vanta_integration_session
SET status = CASE WHEN enabled AND vanta_webhook_url IS NOT NULL THEN 'live' ELSE status END,
    failure_count = 0,
    last_failure_at = NULL,
    last_error_summary = NULL
WHERE last_error_summary ILIKE '%owner_identifier_unknown%'
  AND identity_strategy = 'payload_user';