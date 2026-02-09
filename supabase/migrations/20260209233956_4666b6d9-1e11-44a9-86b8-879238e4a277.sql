
-- Create maintenance_blocks table for tracking unit maintenance periods
CREATE TABLE public.maintenance_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Validation: end_date must be >= start_date
CREATE OR REPLACE FUNCTION public.validate_maintenance_block_dates()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'end_date must be on or after start_date';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_maintenance_block_dates_trigger
BEFORE INSERT OR UPDATE ON public.maintenance_blocks
FOR EACH ROW EXECUTE FUNCTION public.validate_maintenance_block_dates();

-- Enable RLS
ALTER TABLE public.maintenance_blocks ENABLE ROW LEVEL SECURITY;

-- Admins can manage all maintenance blocks
CREATE POLICY "Admins can manage maintenance blocks"
ON public.maintenance_blocks
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Managers can manage maintenance blocks
CREATE POLICY "Managers can manage maintenance blocks"
ON public.maintenance_blocks
FOR ALL
USING (has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

-- All authenticated staff can read maintenance blocks (needed for calendar view and booking validation)
CREATE POLICY "Authenticated users can read maintenance blocks"
ON public.maintenance_blocks
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Add deposit_deadline_hours policy setting if it doesn't exist
INSERT INTO public.policy_settings (key, value, description)
VALUES ('deposit_deadline_hours', '24', 'Number of hours a guest has to pay their deposit after approval')
ON CONFLICT DO NOTHING;
