
-- =============================================
-- Ground Stay: Core Database Schema
-- =============================================

-- 1. Role enum & user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'front_desk_supervisor', 'front_desk', 'maintenance', 'viewer', 'guest');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2. Security definer function for role checks (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS for user_roles: admins can read all, users can read their own
CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 3. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Units table
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  capacity INTEGER NOT NULL DEFAULT 2,
  amenities TEXT[] DEFAULT '{}',
  photos TEXT[] DEFAULT '{}',
  min_nights INTEGER NOT NULL DEFAULT 1,
  cleaning_fee NUMERIC(10,2) DEFAULT 0,
  rules TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  base_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  weekend_price NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage units"
  ON public.units FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Everyone can read active units"
  ON public.units FOR SELECT TO authenticated
  USING (is_active = true);

-- 5. Booking state enum
CREATE TYPE public.booking_state AS ENUM (
  'inquiry', 'soft_hold', 'pending_approval', 'pending_deposit',
  'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'
);

-- 6. Bookings table
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES public.units(id) ON DELETE RESTRICT NOT NULL,
  guest_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  state booking_state NOT NULL DEFAULT 'inquiry',
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  num_guests INTEGER NOT NULL DEFAULT 1,
  total_price NUMERIC(10,2),
  price_override NUMERIC(10,2),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all bookings"
  ON public.bookings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Guests can read own bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (guest_id = auth.uid());

-- Prevent overlapping confirmed bookings (database-level enforcement)
CREATE OR REPLACE FUNCTION public.check_booking_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.state IN ('pending_approval', 'pending_deposit', 'confirmed', 'checked_in') THEN
    IF EXISTS (
      SELECT 1 FROM public.bookings
      WHERE unit_id = NEW.unit_id
        AND id != NEW.id
        AND state IN ('pending_approval', 'pending_deposit', 'confirmed', 'checked_in')
        AND check_in < NEW.check_out
        AND check_out > NEW.check_in
    ) THEN
      RAISE EXCEPTION 'Booking dates overlap with an existing booking for this unit';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_booking_overlap_trigger
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.check_booking_overlap();

-- 7. Booking state log (audit trail)
CREATE TABLE public.booking_state_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  from_state booking_state,
  to_state booking_state NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_state_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage booking logs"
  ON public.booking_state_log FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 8. Pricing rules (seasonal)
CREATE TABLE public.pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pricing rules"
  ON public.pricing_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 9. Policy settings
CREATE TABLE public.policy_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.policy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage policy settings"
  ON public.policy_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can read policy settings"
  ON public.policy_settings FOR SELECT TO authenticated
  USING (true);

-- 10. Payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  method TEXT NOT NULL DEFAULT 'offline',
  status TEXT NOT NULL DEFAULT 'recorded',
  recorded_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage payments"
  ON public.payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 11. Messages (internal notes per booking)
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage messages"
  ON public.messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Guests can read non-internal messages on own bookings"
  ON public.messages FOR SELECT TO authenticated
  USING (
    is_internal = false
    AND booking_id IN (
      SELECT id FROM public.bookings WHERE guest_id = auth.uid()
    )
  );

-- 12. Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 13. Insert default policy settings
INSERT INTO public.policy_settings (key, value, description) VALUES
  ('soft_hold_expiration_hours', '12', 'Hours before a soft hold expires'),
  ('deposit_deadline_hours', '24', 'Hours after approval to submit deposit'),
  ('free_cancellation_days', '7', 'Days before check-in for free cancellation'),
  ('partial_refund_days', '3', 'Days before check-in for partial refund'),
  ('no_refund_hours', '72', 'Hours before check-in — no refund'),
  ('checkout_time', '"11:00"', 'Default check-out time'),
  ('cleaning_buffer_hours', '4', 'Hours of cleaning buffer between bookings'),
  ('earliest_checkin_time', '"16:00"', 'Earliest check-in time');
