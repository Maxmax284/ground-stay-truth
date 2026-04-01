-- Drop the incomplete staff UPDATE policy
DROP POLICY IF EXISTS "Staff can update airport pickups" ON public.airport_pickups;

-- Recreate with proper WITH CHECK for front_desk
CREATE POLICY "Staff can update airport pickups"
  ON public.airport_pickups FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'front_desk'::app_role))
  WITH CHECK (has_role(auth.uid(), 'front_desk'::app_role));

-- Add coverage for front_desk_supervisor (SELECT + UPDATE)
CREATE POLICY "Supervisors can read airport pickups"
  ON public.airport_pickups FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'front_desk_supervisor'::app_role));

CREATE POLICY "Supervisors can update airport pickups"
  ON public.airport_pickups FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'front_desk_supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'front_desk_supervisor'::app_role));