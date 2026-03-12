
-- ============================================================
-- Gap 1: Housekeeping Tasks
-- ============================================================
CREATE TABLE public.housekeeping_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  booking_out_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  booking_in_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  assigned_to UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  due_by TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.housekeeping_tasks ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can manage housekeeping tasks" ON public.housekeeping_tasks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Manager can manage
CREATE POLICY "Managers can manage housekeeping tasks" ON public.housekeeping_tasks
  FOR ALL TO public
  USING (has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

-- Front Desk can read
CREATE POLICY "Staff can read housekeeping tasks" ON public.housekeeping_tasks
  FOR SELECT TO public
  USING (has_role(auth.uid(), 'front_desk'::app_role));

-- Front Desk can update
CREATE POLICY "Staff can update housekeeping tasks" ON public.housekeeping_tasks
  FOR UPDATE TO public
  USING (has_role(auth.uid(), 'front_desk'::app_role));

-- Maintenance can read/update own assigned
CREATE POLICY "Maintenance can read assigned tasks" ON public.housekeeping_tasks
  FOR SELECT TO public
  USING (has_role(auth.uid(), 'maintenance'::app_role));

CREATE POLICY "Maintenance can update assigned tasks" ON public.housekeeping_tasks
  FOR UPDATE TO public
  USING (has_role(auth.uid(), 'maintenance'::app_role) AND assigned_to = auth.uid());

-- Trigger: auto-generate housekeeping task on booking completion
CREATE OR REPLACE FUNCTION public.auto_create_housekeeping_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_booking RECORD;
  buffer_hours INT;
  due TIMESTAMPTZ;
BEGIN
  IF OLD.state IS DISTINCT FROM NEW.state AND NEW.state = 'completed' THEN
    -- Get cleaning buffer hours from policy
    SELECT COALESCE((value::text)::int, 4) INTO buffer_hours
    FROM public.policy_settings
    WHERE key = 'cleaning_buffer_hours'
    LIMIT 1;

    IF buffer_hours IS NULL THEN buffer_hours := 4; END IF;

    -- Find next booking for this unit
    SELECT id, check_in INTO next_booking
    FROM public.bookings
    WHERE unit_id = NEW.unit_id
      AND check_in >= NEW.check_out
      AND state IN ('confirmed', 'pending_deposit', 'pending_approval')
    ORDER BY check_in ASC
    LIMIT 1;

    IF next_booking.check_in IS NOT NULL THEN
      due := (next_booking.check_in::timestamp AT TIME ZONE 'UTC') - (buffer_hours || ' hours')::interval;
    ELSE
      due := (NEW.check_out::timestamp AT TIME ZONE 'UTC') + interval '4 hours';
    END IF;

    INSERT INTO public.housekeeping_tasks (unit_id, booking_out_id, booking_in_id, due_by)
    VALUES (NEW.unit_id, NEW.id, next_booking.id, due);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_housekeeping
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_housekeeping_task();

-- updated_at trigger
CREATE TRIGGER trg_housekeeping_updated_at
  BEFORE UPDATE ON public.housekeeping_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Gap 2: Security Deposits
-- ============================================================
CREATE TABLE public.security_deposits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  amount_held NUMERIC NOT NULL DEFAULT 0,
  amount_deducted NUMERIC DEFAULT 0,
  deduction_reason TEXT,
  status TEXT NOT NULL DEFAULT 'held',
  held_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  inspected_by UUID,
  inspected_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  released_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id)
);

ALTER TABLE public.security_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage security deposits" ON public.security_deposits
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can manage security deposits" ON public.security_deposits
  FOR ALL TO public
  USING (has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Supervisors can read security deposits" ON public.security_deposits
  FOR SELECT TO public
  USING (has_role(auth.uid(), 'front_desk_supervisor'::app_role));

CREATE POLICY "Guests can read own security deposits" ON public.security_deposits
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.bookings
    WHERE bookings.id = security_deposits.booking_id
      AND bookings.guest_id = auth.uid()
  ));

-- ============================================================
-- Gap 6: Training Packages + Booking Links
-- ============================================================
CREATE TABLE public.training_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  duration_days INT NOT NULL DEFAULT 7,
  price NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.training_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage training packages" ON public.training_packages
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Everyone can read active packages" ON public.training_packages
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE TABLE public.booking_training_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.training_packages(id) ON DELETE CASCADE,
  trainer_name TEXT,
  start_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_training_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage training links" ON public.booking_training_links
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can manage training links" ON public.booking_training_links
  FOR ALL TO public
  USING (has_role(auth.uid(), 'front_desk'::app_role))
  WITH CHECK (has_role(auth.uid(), 'front_desk'::app_role));

CREATE POLICY "Guests can read own training links" ON public.booking_training_links
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.bookings
    WHERE bookings.id = booking_training_links.booking_id
      AND bookings.guest_id = auth.uid()
  ));
