
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS original_total numeric;

CREATE TABLE IF NOT EXISTS public.booking_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  adjustment_type text NOT NULL DEFAULT 'discount' CHECK (adjustment_type IN ('discount','surcharge')),
  value_type text NOT NULL CHECK (value_type IN ('percent','fixed')),
  value numeric NOT NULL CHECK (value > 0),
  amount_calculated numeric NOT NULL,
  label text NOT NULL,
  internal_note text,
  applies_to text NOT NULL DEFAULT 'accommodation_subtotal',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','voided')),
  applied_by uuid REFERENCES auth.users(id),
  applied_at timestamptz NOT NULL DEFAULT now(),
  voided_by uuid REFERENCES auth.users(id),
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_adjustments_booking ON public.booking_adjustments(booking_id, status);

GRANT SELECT, INSERT, UPDATE ON public.booking_adjustments TO authenticated;
GRANT ALL ON public.booking_adjustments TO service_role;

ALTER TABLE public.booking_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view all adjustments"
  ON public.booking_adjustments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'front_desk')
    OR public.has_role(auth.uid(),'front_desk_supervisor')
  );

CREATE POLICY "Guests view active adjustments on own bookings"
  ON public.booking_adjustments FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND b.guest_id = auth.uid()
    )
  );

CREATE POLICY "Admin/manager can insert adjustments"
  ON public.booking_adjustments FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
    AND applied_by = auth.uid()
  );

CREATE POLICY "Admin/manager can void adjustments"
  ON public.booking_adjustments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
