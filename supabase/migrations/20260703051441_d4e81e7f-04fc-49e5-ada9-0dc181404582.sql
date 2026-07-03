INSERT INTO public.policy_settings (key, value, description)
SELECT 'fenrir_inbound_enabled', 'false'::jsonb, 'One-way doctrine: Fenrir Lock may NOT control GroundStay. Inbound webhook is disabled by default. Only flip to true for an explicitly approved emergency-control workflow.'
WHERE NOT EXISTS (SELECT 1 FROM public.policy_settings WHERE key = 'fenrir_inbound_enabled');