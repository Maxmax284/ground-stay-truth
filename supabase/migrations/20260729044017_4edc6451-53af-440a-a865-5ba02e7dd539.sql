CREATE OR REPLACE FUNCTION public.can_view_guest_documents(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','manager','front_desk_supervisor','front_desk')
  )
$$;

DROP POLICY IF EXISTS "Staff can view guest document records" ON public.guest_documents;
CREATE POLICY "Staff can view guest document records"
ON public.guest_documents FOR SELECT TO authenticated
USING (public.can_view_guest_documents(auth.uid()));

DROP POLICY IF EXISTS "Staff can update guest document verification" ON public.guest_documents;
CREATE POLICY "Staff can update guest document verification"
ON public.guest_documents FOR UPDATE TO authenticated
USING (public.can_view_guest_documents(auth.uid()))
WITH CHECK (public.can_view_guest_documents(auth.uid()));

DROP POLICY IF EXISTS "Staff can view guest documents" ON storage.objects;
CREATE POLICY "Staff can view guest documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'guest-documents' AND public.can_view_guest_documents(auth.uid()));