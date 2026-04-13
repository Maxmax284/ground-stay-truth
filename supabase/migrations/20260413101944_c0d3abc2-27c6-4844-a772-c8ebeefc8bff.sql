INSERT INTO storage.buckets (id, name, public)
VALUES ('app-downloads', 'app-downloads', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access for app downloads"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'app-downloads');

CREATE POLICY "Admins can upload app downloads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'app-downloads'
  AND public.has_role(auth.uid(), 'admin')
);