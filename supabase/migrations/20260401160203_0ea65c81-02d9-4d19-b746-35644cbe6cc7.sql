
-- =====================================================
-- Phase 1: Multi-Property Database Foundation
-- =====================================================

-- 1.1 Create properties table
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  operational_mode text NOT NULL DEFAULT 'high_turnover',
  timezone text NOT NULL DEFAULT 'Asia/Bangkok',
  settings jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

-- Everyone can read active properties
CREATE POLICY "Everyone can read active properties"
  ON public.properties FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Admins can manage properties
CREATE POLICY "Admins can manage properties"
  ON public.properties FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 1.2 Create user_property_assignments table
CREATE TABLE public.user_property_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, property_id)
);

ALTER TABLE public.user_property_assignments ENABLE ROW LEVEL SECURITY;

-- Users can read their own assignments
CREATE POLICY "Users can read own property assignments"
  ON public.user_property_assignments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can manage all assignments
CREATE POLICY "Admins can manage property assignments"
  ON public.user_property_assignments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 1.3 Create driver_property_assignments junction table
CREATE TABLE public.driver_property_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(driver_id, property_id)
);

ALTER TABLE public.driver_property_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read driver property assignments"
  ON public.driver_property_assignments FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'front_desk'));

CREATE POLICY "Admins can manage driver property assignments"
  ON public.driver_property_assignments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 1.4 Create has_property_access security definer function
CREATE OR REPLACE FUNCTION public.has_property_access(_user_id uuid, _property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_property_assignments
    WHERE user_id = _user_id AND property_id = _property_id
  )
$$;

-- 1.5 Add property_id to core tables (nullable initially for migration)
ALTER TABLE public.units ADD COLUMN property_id uuid REFERENCES public.properties(id);
ALTER TABLE public.bookings ADD COLUMN property_id uuid REFERENCES public.properties(id);
ALTER TABLE public.airport_pickups ADD COLUMN property_id uuid REFERENCES public.properties(id);
ALTER TABLE public.housekeeping_tasks ADD COLUMN property_id uuid REFERENCES public.properties(id);
ALTER TABLE public.maintenance_requests ADD COLUMN property_id uuid REFERENCES public.properties(id);
ALTER TABLE public.laundry_requests ADD COLUMN property_id uuid REFERENCES public.properties(id);
ALTER TABLE public.messages ADD COLUMN property_id uuid REFERENCES public.properties(id);
ALTER TABLE public.policy_settings ADD COLUMN property_id uuid REFERENCES public.properties(id);

-- 1.6 Add cleaning_mode to units
ALTER TABLE public.units ADD COLUMN cleaning_mode text NOT NULL DEFAULT 'event_based';

-- 1.7 Create trigger to inherit property_id from unit to booking
CREATE OR REPLACE FUNCTION public.inherit_property_from_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.property_id IS NULL AND NEW.unit_id IS NOT NULL THEN
    SELECT property_id INTO NEW.property_id
    FROM public.units
    WHERE id = NEW.unit_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_booking_inherit_property
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_property_from_unit();

-- 1.8 Create trigger to inherit property_id from booking to child tables
CREATE OR REPLACE FUNCTION public.inherit_property_from_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.property_id IS NULL AND NEW.booking_id IS NOT NULL THEN
    SELECT property_id INTO NEW.property_id
    FROM public.bookings
    WHERE id = NEW.booking_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pickup_inherit_property
  BEFORE INSERT ON public.airport_pickups
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_property_from_booking();

CREATE TRIGGER trg_message_inherit_property
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_property_from_booking();

-- 1.9 Create trigger to inherit property_id from unit for housekeeping/maintenance/laundry
CREATE OR REPLACE FUNCTION public.inherit_property_from_unit_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.property_id IS NULL AND NEW.unit_id IS NOT NULL THEN
    SELECT property_id INTO NEW.property_id
    FROM public.units
    WHERE id = NEW.unit_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_housekeeping_inherit_property
  BEFORE INSERT ON public.housekeeping_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_property_from_unit_id();

CREATE TRIGGER trg_maintenance_inherit_property
  BEFORE INSERT ON public.maintenance_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_property_from_unit_id();

CREATE TRIGGER trg_laundry_inherit_property
  BEFORE INSERT ON public.laundry_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_property_from_unit_id();
