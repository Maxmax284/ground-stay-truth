DELETE FROM public.user_property_assignments
WHERE user_id IN ('25ddcbea-8282-4152-8e63-101559a7161d','7dfbd049-d204-48f8-9553-8aca63dce32e');

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'front_desk'::app_role
FROM auth.users u
WHERE u.email IN ('lamaimuaythaicamp@gmail.com','lamaimuaythaicamp+nam@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_property_assignments (user_id, property_id)
SELECT u.id, pr.id
FROM auth.users u
CROSS JOIN public.properties pr
WHERE u.email IN ('lamaimuaythaicamp@gmail.com','lamaimuaythaicamp+nam@gmail.com')
ON CONFLICT DO NOTHING;