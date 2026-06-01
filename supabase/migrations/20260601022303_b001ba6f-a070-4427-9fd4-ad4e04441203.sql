
-- Media library metadata: folders, captions, alt text, tags per stored photo.
-- Keyed by storage path inside the `unit-photos` bucket. Admin/manager only.

CREATE TABLE IF NOT EXISTS public.media_library_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL UNIQUE,
  original_filename TEXT,
  folder TEXT NOT NULL DEFAULT 'Uncategorized',
  caption TEXT,
  alt_text TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  property_id UUID,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_library_assets TO authenticated;
GRANT ALL ON public.media_library_assets TO service_role;

ALTER TABLE public.media_library_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage media library assets"
ON public.media_library_assets FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers manage media library assets"
ON public.media_library_assets FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Front desk can read media library assets"
ON public.media_library_assets FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'front_desk'::app_role));

CREATE TRIGGER update_media_library_assets_updated_at
BEFORE UPDATE ON public.media_library_assets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_media_library_folder ON public.media_library_assets(folder);
CREATE INDEX IF NOT EXISTS idx_media_library_tags ON public.media_library_assets USING GIN(tags);
