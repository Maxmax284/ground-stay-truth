CREATE OR REPLACE FUNCTION public.get_email_deliverability(_email text)
RETURNS TABLE(reason text, since timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.reason, s.created_at
  FROM public.suppressed_emails s
  WHERE _email IS NOT NULL
    AND lower(s.email) = lower(trim(_email))
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
         OR public.has_role(auth.uid(),'front_desk_supervisor') OR public.has_role(auth.uid(),'front_desk'))
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_email_deliverability(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_email_deliverability(text) TO authenticated;