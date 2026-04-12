INSERT INTO storage.buckets (id, name, public)
VALUES ('intelligence-images', 'intelligence-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can read intelligence images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'intelligence-images');

CREATE POLICY "Admins can manage intelligence images"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'intelligence-images' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'intelligence-images' AND public.has_role(auth.uid(), 'admin'::app_role));