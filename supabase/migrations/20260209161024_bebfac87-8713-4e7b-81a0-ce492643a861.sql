
-- Create unit_groups table
CREATE TABLE public.unit_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.unit_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage unit groups"
  ON public.unit_groups FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Everyone can read active groups"
  ON public.unit_groups FOR SELECT
  USING (is_active = true);

CREATE TRIGGER update_unit_groups_updated_at
  BEFORE UPDATE ON public.unit_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add group_id to units
ALTER TABLE public.units
  ADD COLUMN group_id UUID REFERENCES public.unit_groups(id) ON DELETE SET NULL;

-- Storage bucket for unit photos
INSERT INTO storage.buckets (id, name, public)
  VALUES ('unit-photos', 'unit-photos', true);

CREATE POLICY "Anyone can view unit photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'unit-photos');

CREATE POLICY "Admins can upload unit photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'unit-photos' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update unit photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'unit-photos' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete unit photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'unit-photos' AND has_role(auth.uid(), 'admin'));
