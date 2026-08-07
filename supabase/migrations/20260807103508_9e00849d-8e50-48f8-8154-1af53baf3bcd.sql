INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'front_desk'::app_role
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.email = 'lamaimuaythaicamp+nam@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_property_assignments (user_id, property_id)
SELECT p.id, pr.id
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
CROSS JOIN public.properties pr
WHERE p.email = 'lamaimuaythaicamp+nam@gmail.com'
ON CONFLICT DO NOTHING;