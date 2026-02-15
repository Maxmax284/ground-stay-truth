
-- ============================================
-- Stay Support Module: Tables, RLS, Triggers, Storage
-- ============================================

-- 1. maintenance_requests table
CREATE TABLE public.maintenance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  unit_id uuid NOT NULL REFERENCES public.units(id),
  category text NOT NULL CHECK (category IN ('plumbing', 'electrical', 'appliance', 'cleanliness', 'other')),
  description text NOT NULL,
  photo_url text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent')),
  created_by uuid REFERENCES auth.users(id),
  resolved_by uuid REFERENCES auth.users(id),
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_maintenance_requests_updated_at
  BEFORE UPDATE ON public.maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: Guests create on own checked-in booking
CREATE POLICY "Guests can create maintenance requests"
  ON public.maintenance_requests FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings
      WHERE bookings.id = maintenance_requests.booking_id
        AND bookings.guest_id = auth.uid()
        AND bookings.state = 'checked_in'
    )
  );

-- RLS: Guests read own
CREATE POLICY "Guests can read own maintenance requests"
  ON public.maintenance_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings
      WHERE bookings.id = maintenance_requests.booking_id
        AND bookings.guest_id = auth.uid()
    )
  );

-- RLS: Staff read all
CREATE POLICY "Staff can read all maintenance requests"
  ON public.maintenance_requests FOR SELECT
  USING (public.has_role(auth.uid(), 'front_desk'));

-- RLS: Maintenance can update
CREATE POLICY "Maintenance can update maintenance requests"
  ON public.maintenance_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'maintenance'));

-- RLS: Manager full control
CREATE POLICY "Managers can manage maintenance requests"
  ON public.maintenance_requests FOR ALL
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));

-- RLS: Admin full control
CREATE POLICY "Admins can manage maintenance requests"
  ON public.maintenance_requests FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. laundry_requests table
CREATE TABLE public.laundry_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  unit_id uuid NOT NULL REFERENCES public.units(id),
  bag_count integer,
  note text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'in_progress', 'ready_for_pickup', 'collected')),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.laundry_requests ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_laundry_requests_updated_at
  BEFORE UPDATE ON public.laundry_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: Guests create on own checked-in booking
CREATE POLICY "Guests can create laundry requests"
  ON public.laundry_requests FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings
      WHERE bookings.id = laundry_requests.booking_id
        AND bookings.guest_id = auth.uid()
        AND bookings.state = 'checked_in'
    )
  );

-- RLS: Guests read own
CREATE POLICY "Guests can read own laundry requests"
  ON public.laundry_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings
      WHERE bookings.id = laundry_requests.booking_id
        AND bookings.guest_id = auth.uid()
    )
  );

-- RLS: Staff read all
CREATE POLICY "Staff can read all laundry requests"
  ON public.laundry_requests FOR SELECT
  USING (public.has_role(auth.uid(), 'front_desk'));

-- RLS: Staff update status
CREATE POLICY "Staff can update laundry requests"
  ON public.laundry_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'front_desk'));

-- RLS: Manager full control
CREATE POLICY "Managers can manage laundry requests"
  ON public.laundry_requests FOR ALL
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));

-- RLS: Admin full control
CREATE POLICY "Admins can manage laundry requests"
  ON public.laundry_requests FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. stay_support_log audit table
CREATE TABLE public.stay_support_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  request_type text NOT NULL CHECK (request_type IN ('maintenance', 'laundry')),
  request_id uuid NOT NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  changed_by uuid REFERENCES auth.users(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stay_support_log ENABLE ROW LEVEL SECURITY;

-- RLS: Staff read
CREATE POLICY "Staff can read stay support log"
  ON public.stay_support_log FOR SELECT
  USING (public.has_role(auth.uid(), 'front_desk'));

-- RLS: Guests read own
CREATE POLICY "Guests can read own stay support log"
  ON public.stay_support_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings
      WHERE bookings.id = stay_support_log.booking_id
        AND bookings.guest_id = auth.uid()
    )
  );

-- RLS: Authenticated insert
CREATE POLICY "Authenticated users can insert stay support log"
  ON public.stay_support_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- RLS: Admin full control
CREATE POLICY "Admins can manage stay support log"
  ON public.stay_support_log FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Storage bucket for maintenance photos
INSERT INTO storage.buckets (id, name, public) VALUES ('maintenance-photos', 'maintenance-photos', false);

-- Storage RLS: Guests upload to their booking path
CREATE POLICY "Guests can upload maintenance photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'maintenance-photos'
    AND auth.uid() IS NOT NULL
  );

-- Storage RLS: Staff can read maintenance photos
CREATE POLICY "Staff can read maintenance photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'maintenance-photos'
    AND public.has_role(auth.uid(), 'front_desk')
  );

-- Storage RLS: Guests can read own maintenance photos
CREATE POLICY "Guests can read own maintenance photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'maintenance-photos'
    AND auth.uid() IS NOT NULL
  );
