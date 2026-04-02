-- Drop the old unique constraint on key alone
ALTER TABLE public.policy_settings DROP CONSTRAINT policy_settings_key_key;

-- Add a new unique constraint on (key, property_id) using COALESCE for null handling
CREATE UNIQUE INDEX policy_settings_key_property_uniq ON public.policy_settings (key, COALESCE(property_id, '00000000-0000-0000-0000-000000000000'::uuid));