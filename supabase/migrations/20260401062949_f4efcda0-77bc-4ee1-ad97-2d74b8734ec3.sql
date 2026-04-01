
-- 1. Occupancy validation trigger
CREATE OR REPLACE FUNCTION public.validate_booking_occupancy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  unit_capacity INT;
  unit_max_extra_beds INT;
  max_allowed INT;
BEGIN
  SELECT capacity, max_extra_beds INTO unit_capacity, unit_max_extra_beds
  FROM public.units
  WHERE id = NEW.unit_id;

  IF unit_capacity IS NULL THEN
    RAISE EXCEPTION 'Unit not found';
  END IF;

  max_allowed := unit_capacity + COALESCE(unit_max_extra_beds, 0);

  IF NEW.num_guests > max_allowed THEN
    RAISE EXCEPTION 'Guest count (%) exceeds maximum allowed (%) for this unit', NEW.num_guests, max_allowed;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_booking_occupancy
  BEFORE INSERT OR UPDATE OF num_guests, unit_id ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_booking_occupancy();

-- 2. Add soft_hold to overlap check
CREATE OR REPLACE FUNCTION public.check_booking_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.state IN ('soft_hold', 'pending_approval', 'pending_deposit', 'confirmed', 'checked_in') THEN
    IF EXISTS (
      SELECT 1 FROM public.bookings
      WHERE unit_id = NEW.unit_id
        AND id != NEW.id
        AND state IN ('soft_hold', 'pending_approval', 'pending_deposit', 'confirmed', 'checked_in')
        AND check_in < NEW.check_out
        AND check_out > NEW.check_in
    ) THEN
      RAISE EXCEPTION 'Booking dates overlap with an existing booking for this unit';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Harden profile RLS: replace open read with scoped policies
DROP POLICY IF EXISTS "Authenticated users can read policy settings" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Staff can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Everyone can read profiles" ON public.profiles;

-- Users can only read their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Staff (front_desk+) can read all profiles
CREATE POLICY "Staff can read all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'front_desk'::app_role));

-- 4. Add deduction_evidence_urls to security_deposits
ALTER TABLE public.security_deposits
  ADD COLUMN IF NOT EXISTS deduction_evidence_urls text[] DEFAULT '{}';
