
-- Pre-arrival checklist table
CREATE TABLE public.pre_arrival_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(booking_id, item_key)
);

ALTER TABLE public.pre_arrival_checklist ENABLE ROW LEVEL SECURITY;

-- Guests can manage their own checklist
CREATE POLICY "Guests can read own checklist" ON public.pre_arrival_checklist
FOR SELECT USING (EXISTS (SELECT 1 FROM bookings WHERE bookings.id = pre_arrival_checklist.booking_id AND bookings.guest_id = auth.uid()));

CREATE POLICY "Guests can update own checklist" ON public.pre_arrival_checklist
FOR UPDATE USING (EXISTS (SELECT 1 FROM bookings WHERE bookings.id = pre_arrival_checklist.booking_id AND bookings.guest_id = auth.uid()));

CREATE POLICY "Guests can insert own checklist" ON public.pre_arrival_checklist
FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM bookings WHERE bookings.id = pre_arrival_checklist.booking_id AND bookings.guest_id = auth.uid()));

-- Staff can read
CREATE POLICY "Staff can read checklist" ON public.pre_arrival_checklist
FOR SELECT USING (has_role(auth.uid(), 'front_desk'::app_role));

-- Admins full access
CREATE POLICY "Admins can manage checklist" ON public.pre_arrival_checklist
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_pre_arrival_checklist_updated_at
BEFORE UPDATE ON public.pre_arrival_checklist
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add pre_arrival_status to bookings
ALTER TABLE public.bookings ADD COLUMN pre_arrival_status text NOT NULL DEFAULT 'pending';
