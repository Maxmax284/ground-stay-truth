-- Also recognise a staff member's own mobile/WhatsApp saved on their profile,
-- so a reply from it reads as staff without a manager re-entering it.
CREATE OR REPLACE FUNCTION public.resolve_staff_phone(_raw text)
RETURNS TABLE (user_id uuid, label text, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id, s.label, p.full_name
  FROM public.staff_phone_numbers s
  LEFT JOIN public.profiles p ON p.user_id = s.user_id
  WHERE s.is_active = true
    AND s.phone_e164 = public.normalize_phone(_raw)
  UNION ALL
  SELECT p.user_id, COALESCE(p.full_name, 'Camp team'), p.full_name
  FROM public.profiles p
  WHERE public.normalize_phone(_raw) IN (
          public.normalize_phone(p.phone),
          public.normalize_phone(p.whatsapp)
        )
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.user_id AND ur.role <> 'guest'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_phone_numbers s2
      WHERE s2.is_active = true AND s2.phone_e164 = public.normalize_phone(_raw)
    )
  LIMIT 1
$$;