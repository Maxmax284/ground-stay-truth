-- Staff phone directory: the numbers the camp answers from.
-- Capture/identity only. Nothing here mutates bookings, payments or pickups.

CREATE OR REPLACE FUNCTION public.normalize_phone(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _raw IS NULL OR btrim(_raw) = '' THEN NULL
    ELSE '+' || regexp_replace(_raw, '[^0-9]', '', 'g')
  END
$$;

CREATE TABLE public.staff_phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_raw text NOT NULL,
  phone_e164 text NOT NULL,
  label text NOT NULL,
  user_id uuid NULL,
  channel text NOT NULL DEFAULT 'both',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_phone_channel_check CHECK (channel IN ('whatsapp', 'sms', 'both')),
  CONSTRAINT staff_phone_e164_shape CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,17}$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_phone_numbers TO authenticated;
GRANT ALL ON public.staff_phone_numbers TO service_role;

ALTER TABLE public.staff_phone_numbers ENABLE ROW LEVEL SECURITY;

-- Every staff member can see who the camp answers from.
CREATE POLICY "Staff can read staff phone numbers"
ON public.staff_phone_numbers FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'front_desk_supervisor')
  OR public.has_role(auth.uid(), 'front_desk')
  OR public.has_role(auth.uid(), 'maintenance')
  OR public.has_role(auth.uid(), 'viewer')
);

-- Only managers and admins add or change the directory.
CREATE POLICY "Managers and admins insert staff phone numbers"
ON public.staff_phone_numbers FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers and admins update staff phone numbers"
ON public.staff_phone_numbers FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers and admins delete staff phone numbers"
ON public.staff_phone_numbers FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- One number, one owner. A manager and an admin cannot register the same line twice.
CREATE UNIQUE INDEX staff_phone_numbers_e164_unique
ON public.staff_phone_numbers (phone_e164);

CREATE INDEX staff_phone_numbers_user_idx ON public.staff_phone_numbers (user_id);

-- Normalize on write so "+66 81 234 5678" and "0066812345678" collide as they should.
CREATE OR REPLACE FUNCTION public.staff_phone_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.phone_e164 := public.normalize_phone(NEW.phone_raw);
  IF NEW.phone_e164 IS NULL THEN
    RAISE EXCEPTION 'A phone number is required';
  END IF;
  NEW.label := btrim(NEW.label);
  IF NEW.label = '' THEN
    RAISE EXCEPTION 'A label is required so staff know which line this is';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER staff_phone_normalize_trg
BEFORE INSERT OR UPDATE ON public.staff_phone_numbers
FOR EACH ROW EXECUTE FUNCTION public.staff_phone_normalize();

-- Resolve an inbound number to a staff identity. Read-only lookup.
CREATE OR REPLACE FUNCTION public.resolve_staff_phone(_raw text)
RETURNS TABLE (user_id uuid, label text, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id, s.label, p.full_name
  FROM public.staff_phone_numbers s
  LEFT JOIN public.profiles p ON p.user_id = s.user_id
  WHERE s.is_active = true
    AND s.phone_e164 = public.normalize_phone(_raw)
  LIMIT 1
$$;