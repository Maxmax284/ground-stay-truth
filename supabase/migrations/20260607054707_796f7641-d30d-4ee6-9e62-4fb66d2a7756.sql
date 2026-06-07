INSERT INTO public.policy_settings (key, value, property_id)
VALUES ('front_desk_briefing_narrative_default', 'false'::jsonb, NULL)
ON CONFLICT DO NOTHING;