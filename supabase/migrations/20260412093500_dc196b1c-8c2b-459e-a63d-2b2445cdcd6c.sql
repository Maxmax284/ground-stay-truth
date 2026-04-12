
-- Create the intelligence_entries table
CREATE TABLE public.intelligence_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('heads_up', 'playbook')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  title text NOT NULL,
  body text NOT NULL,
  location text[] DEFAULT '{global}',
  category text NOT NULL CHECK (category IN ('money', 'transport', 'safety', 'connectivity', 'customs', 'health', 'local_life')),
  audience text[] NOT NULL DEFAULT '{guest,staff}',
  severity text DEFAULT 'normal' CHECK (severity IN ('urgent', 'attention', 'normal')),
  image_url text,
  image_caption text,
  sort_order int DEFAULT 0,
  expires_at timestamptz,
  promoted_from uuid REFERENCES public.intelligence_entries(id),
  created_by uuid,
  approved_by uuid,
  property_id uuid REFERENCES public.properties(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.intelligence_entries ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can manage intelligence entries"
ON public.intelligence_entries
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Managers can read all entries
CREATE POLICY "Managers can read intelligence entries"
ON public.intelligence_entries
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'manager'::app_role));

-- Staff can read active entries
CREATE POLICY "Staff can read active intelligence entries"
ON public.intelligence_entries
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'front_desk'::app_role) AND status = 'active');

-- Guests can read active entries where audience includes 'guest'
CREATE POLICY "Guests can read active guest intelligence"
ON public.intelligence_entries
FOR SELECT
TO authenticated
USING (status = 'active' AND 'guest' = ANY(audience));

-- Auto-update updated_at
CREATE TRIGGER update_intelligence_entries_updated_at
BEFORE UPDATE ON public.intelligence_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for common queries
CREATE INDEX idx_intelligence_entries_status_type ON public.intelligence_entries(status, type);
CREATE INDEX idx_intelligence_entries_location ON public.intelligence_entries USING GIN(location);
CREATE INDEX idx_intelligence_entries_audience ON public.intelligence_entries USING GIN(audience);
