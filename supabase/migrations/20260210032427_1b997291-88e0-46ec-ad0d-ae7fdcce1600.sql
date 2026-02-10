
-- Create the guest-documents storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('guest-documents', 'guest-documents', false);

-- Staff can view documents for any booking
CREATE POLICY "Staff can view guest documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'guest-documents'
  AND public.has_role(auth.uid(), 'front_desk')
);

-- Staff (front_desk+) can upload documents
CREATE POLICY "Staff can upload guest documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'guest-documents'
  AND public.has_role(auth.uid(), 'front_desk')
);

-- Manager+ can delete documents
CREATE POLICY "Managers can delete guest documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'guest-documents'
  AND public.has_role(auth.uid(), 'manager')
);

-- Create a table to track document metadata linked to bookings
CREATE TABLE public.guest_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_documents ENABLE ROW LEVEL SECURITY;

-- Staff can view documents
CREATE POLICY "Staff can view guest document records"
ON public.guest_documents FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'front_desk'));

-- Staff can insert documents
CREATE POLICY "Staff can insert guest document records"
ON public.guest_documents FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'front_desk'));

-- Manager+ can delete
CREATE POLICY "Managers can delete guest document records"
ON public.guest_documents FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'manager'));
