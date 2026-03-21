
-- Fix #1: Guest document storage policies (missing guest upload/read)
CREATE POLICY "Guests can upload own documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'guest-documents'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] IN (
    SELECT b.id::text FROM public.bookings b WHERE b.guest_id = auth.uid()
  )
);

CREATE POLICY "Guests can read own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'guest-documents'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] IN (
    SELECT b.id::text FROM public.bookings b WHERE b.guest_id = auth.uid()
  )
);

-- Admin full access to guest documents storage
CREATE POLICY "Admins can manage guest documents storage"
ON storage.objects FOR ALL
USING (bucket_id = 'guest-documents' AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'guest-documents' AND has_role(auth.uid(), 'admin'::app_role));

-- Fix #6: Add weekly_rate, monthly_rate, sort_order to units
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS weekly_rate numeric DEFAULT NULL;
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS monthly_rate numeric DEFAULT NULL;
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
