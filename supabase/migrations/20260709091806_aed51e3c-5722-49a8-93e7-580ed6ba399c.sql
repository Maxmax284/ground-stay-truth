-- Stage 1: units expansion + local_recommendations

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS listing_category text NOT NULL DEFAULT 'on_site',
  ADD COLUMN IF NOT EXISTS region text;

CREATE INDEX IF NOT EXISTS idx_units_listing_category ON public.units(listing_category);

-- Curated nearby recommendations
CREATE TABLE IF NOT EXISTS public.local_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  description text,
  photos text[] NOT NULL DEFAULT '{}',
  address text,
  maps_url text,
  phone text,
  whatsapp text,
  website text,
  opening_hours text,
  distance_note text,
  staff_notes text,
  badges text[] NOT NULL DEFAULT '{}',
  featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_local_recs_featured_active
  ON public.local_recommendations(featured, is_active);
CREATE INDEX IF NOT EXISTS idx_local_recs_category
  ON public.local_recommendations(category);

GRANT SELECT ON public.local_recommendations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.local_recommendations TO authenticated;
GRANT ALL ON public.local_recommendations TO service_role;

ALTER TABLE public.local_recommendations ENABLE ROW LEVEL SECURITY;

-- Public / anon can only see featured + active entries
CREATE POLICY "Public can view featured active recommendations"
ON public.local_recommendations
FOR SELECT
TO anon
USING (featured = true AND is_active = true);

-- Any authenticated user (including guests) sees featured+active,
-- staff/admin/manager see everything
CREATE POLICY "Authenticated users view recommendations"
ON public.local_recommendations
FOR SELECT
TO authenticated
USING (
  (featured = true AND is_active = true)
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'front_desk')
  OR public.has_role(auth.uid(), 'front_desk_supervisor')
);

CREATE POLICY "Managers and admins can insert recommendations"
ON public.local_recommendations
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Managers and admins can update recommendations"
ON public.local_recommendations
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Admins can delete recommendations"
ON public.local_recommendations
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_local_recommendations_updated_at
BEFORE UPDATE ON public.local_recommendations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
