UPDATE public.policy_settings
SET value = to_jsonb('BDfpz2UfhgovYdzcyYsTcX44hs63mljMEziXM9IvTIChr7tZZsbD40v7Hy_tsj_3oXOWhmC40bivPZpG1-G-BCE'::text)
WHERE key = 'vapid_public_key';

INSERT INTO public.policy_settings (key, value)
SELECT 'vapid_public_key', to_jsonb('BDfpz2UfhgovYdzcyYsTcX44hs63mljMEziXM9IvTIChr7tZZsbD40v7Hy_tsj_3oXOWhmC40bivPZpG1-G-BCE'::text)
WHERE NOT EXISTS (SELECT 1 FROM public.policy_settings WHERE key = 'vapid_public_key');

DELETE FROM public.push_subscriptions;