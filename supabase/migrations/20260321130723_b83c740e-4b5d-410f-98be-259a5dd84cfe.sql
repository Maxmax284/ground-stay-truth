
-- =============================================
-- 1. DRIVERS TABLE
-- =============================================
CREATE TABLE public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  whatsapp text,
  vehicle_type text,
  license_plate text,
  photo_url text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins can manage drivers"
  ON public.drivers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Managers full access
CREATE POLICY "Managers can manage drivers"
  ON public.drivers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));

-- Front desk can read active drivers (for assignment dropdown)
CREATE POLICY "Staff can read active drivers"
  ON public.drivers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'front_desk') AND is_active = true);

-- Timestamp trigger
CREATE TRIGGER update_drivers_updated_at
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 2. AIRPORT PICKUPS TABLE
-- =============================================
CREATE TABLE public.airport_pickups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'requested',
  fee numeric NOT NULL DEFAULT 0,
  fee_override boolean NOT NULL DEFAULT false,
  fee_override_reason text,
  fee_override_by uuid,
  flight_number text,
  arrival_datetime timestamptz,
  passenger_count integer DEFAULT 1,
  luggage_notes text,
  special_instructions text,
  assigned_by uuid,
  assigned_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_pickup_status CHECK (status IN ('requested','assigned','confirmed','completed','cancelled'))
);

CREATE UNIQUE INDEX idx_airport_pickups_booking ON public.airport_pickups(booking_id);

ALTER TABLE public.airport_pickups ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins can manage airport pickups"
  ON public.airport_pickups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Managers full access
CREATE POLICY "Managers can manage airport pickups"
  ON public.airport_pickups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));

-- Staff can read all pickups
CREATE POLICY "Staff can read airport pickups"
  ON public.airport_pickups FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'front_desk'));

-- Staff can update pickups (assign driver, update status)
CREATE POLICY "Staff can update airport pickups"
  ON public.airport_pickups FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'front_desk'));

-- Staff can insert pickups (on behalf of guest)
CREATE POLICY "Staff can insert airport pickups"
  ON public.airport_pickups FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'front_desk'));

-- Guests can read own pickup
CREATE POLICY "Guests can read own airport pickup"
  ON public.airport_pickups FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM bookings
    WHERE bookings.id = airport_pickups.booking_id
      AND bookings.guest_id = auth.uid()
  ));

-- Guests can create pickup request on own booking
CREATE POLICY "Guests can request airport pickup"
  ON public.airport_pickups FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM bookings
    WHERE bookings.id = airport_pickups.booking_id
      AND bookings.guest_id = auth.uid()
  ));

-- Timestamp trigger
CREATE TRIGGER update_airport_pickups_updated_at
  BEFORE UPDATE ON public.airport_pickups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
