INSERT INTO public.policy_settings (key, value, description)
VALUES 
  ('sound_effects_enabled', '"false"', 'Enable or disable Ground Sounds platform-wide'),
  ('sound_effects_volume', '50', 'Ground Sounds volume level (0-100)')
ON CONFLICT (key) DO NOTHING;