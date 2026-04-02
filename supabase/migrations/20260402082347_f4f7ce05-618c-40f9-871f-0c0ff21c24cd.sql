-- Delete old global (property_id IS NULL) arrival welcome settings
DELETE FROM public.policy_settings 
WHERE key IN ('arrival_welcome_bkk', 'arrival_welcome_samui') 
AND property_id IS NULL;

-- Create blank property-specific templates for Lamai Muay Thai
INSERT INTO public.policy_settings (key, value, property_id, description)
VALUES 
  ('arrival_welcome_bkk', '{"welcome_message":"","sections":[],"photos":[],"enabled":false}'::jsonb, '3f601c68-de37-4742-bb12-c4bab0b5e85a', 'Arrival welcome guide for BKK (Lamai Muay Thai)'),
  ('arrival_welcome_samui', '{"welcome_message":"","sections":[],"photos":[],"enabled":false}'::jsonb, '3f601c68-de37-4742-bb12-c4bab0b5e85a', 'Arrival welcome guide for Samui (Lamai Muay Thai)');

-- Create blank property-specific templates for Koh Shanti Guesthouse
INSERT INTO public.policy_settings (key, value, property_id, description)
VALUES 
  ('arrival_welcome_bkk', '{"welcome_message":"","sections":[],"photos":[],"enabled":false}'::jsonb, 'de57d818-20d6-4292-aad2-7ca44cc96da4', 'Arrival welcome guide for BKK (Koh Shanti Guesthouse)'),
  ('arrival_welcome_samui', '{"welcome_message":"","sections":[],"photos":[],"enabled":false}'::jsonb, 'de57d818-20d6-4292-aad2-7ca44cc96da4', 'Arrival welcome guide for Samui (Koh Shanti Guesthouse)');