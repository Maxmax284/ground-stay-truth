
-- ============ 1. Units: restrict broad read ============
DROP POLICY IF EXISTS "Everyone can read active units" ON public.units;

-- Public-safe SELECT policy for the columns that guests need directly.
-- Since Postgres RLS is row-scoped (not column-scoped) we still need broader
-- access for guests to see basic listing info; the sensitive columns are
-- filtered via the units_public view below (used by guest-facing code) and
-- via the get_unit_essentials() RPC (used by booked guests only).
CREATE POLICY "Authenticated can read active units basic"
ON public.units FOR SELECT
USING (
  is_active = true
  AND auth.uid() IS NOT NULL
);

-- Public-safe view that omits wifi_password, wifi_network,
-- emergency_contact_name, emergency_contact_phone.
CREATE OR REPLACE VIEW public.units_public
WITH (security_barrier = true, security_invoker = false) AS
SELECT
  id, property_id, name, description, capacity, base_price, weekend_price,
  cleaning_fee, min_nights, amenities, photos, group_id, is_active,
  sort_order, weekly_rate, monthly_rate, max_extra_beds, extra_bed_fee,
  pricing_type, reviews_enabled, rules, house_rules_detail,
  created_at, updated_at
FROM public.units
WHERE is_active = true;

GRANT SELECT ON public.units_public TO anon, authenticated;

-- ============ 2. Essentials RPC: booked guest OR staff ============
CREATE OR REPLACE FUNCTION public.get_unit_essentials(_unit_id uuid)
RETURNS TABLE (
  wifi_network text,
  wifi_password text,
  house_rules_detail text,
  emergency_contact_name text,
  emergency_contact_phone text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF has_role(auth.uid(), 'front_desk'::app_role)
     OR has_role(auth.uid(), 'front_desk_supervisor'::app_role)
     OR has_role(auth.uid(), 'manager'::app_role)
     OR has_role(auth.uid(), 'admin'::app_role)
  THEN
    RETURN QUERY
      SELECT u.wifi_network, u.wifi_password, u.house_rules_detail,
             u.emergency_contact_name, u.emergency_contact_phone
      FROM public.units u WHERE u.id = _unit_id;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.unit_id = _unit_id
      AND b.guest_id = auth.uid()
      AND b.status IN ('confirmed','pre_arrival','checked_in','in_stay')
  ) THEN
    RETURN QUERY
      SELECT u.wifi_network, u.wifi_password, u.house_rules_detail,
             u.emergency_contact_name, u.emergency_contact_phone
      FROM public.units u WHERE u.id = _unit_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_unit_essentials(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unit_essentials(uuid) TO authenticated;

-- ============ 3. Maintenance photos: staff-only ============
DROP POLICY IF EXISTS "Guests can read own maintenance photos" ON storage.objects;
DROP POLICY IF EXISTS "Guests can upload maintenance photos" ON storage.objects;

CREATE POLICY "Staff can upload maintenance photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'maintenance-photos'
  AND (
    has_role(auth.uid(), 'front_desk'::app_role)
    OR has_role(auth.uid(), 'front_desk_supervisor'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'maintenance'::app_role)
  )
);

CREATE POLICY "Staff can update maintenance photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'maintenance-photos'
  AND (
    has_role(auth.uid(), 'front_desk'::app_role)
    OR has_role(auth.uid(), 'front_desk_supervisor'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'maintenance'::app_role)
  )
);

CREATE POLICY "Staff can delete maintenance photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'maintenance-photos'
  AND (
    has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Note: "Staff can read maintenance photos" already exists and covers SELECT.
