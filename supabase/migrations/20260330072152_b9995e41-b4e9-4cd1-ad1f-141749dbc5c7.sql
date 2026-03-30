CREATE POLICY "Staff can read all units including inactive"
ON public.units
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'front_desk'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);