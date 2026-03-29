INSERT INTO public.policy_settings (key, value, description)
VALUES ('fenrir_receive_token', '""', 'Authentication token for inbound Fenrir Lock webhook commands')
ON CONFLICT (key) DO NOTHING;