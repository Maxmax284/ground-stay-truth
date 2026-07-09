
-- Revoke column-level SELECT on sensitive unit fields.
-- PostgREST's select=* will silently omit these for anon/authenticated,
-- and any explicit select of them will return a permission error.
-- Admins and staff read them via the SECURITY DEFINER RPCs below.
-- Edge functions using the service role bypass this entirely.
REVOKE SELECT (wifi_network, wifi_password, emergency_contact_name, emergency_contact_phone)
  ON public.units FROM authenticated, anon;

-- Rebuild the public view without the sensitive fields so callers that
-- want select=* on the catalog have a safe target.
DROP VIEW IF EXISTS public.units_public;
CREATE OR REPLACE VIEW public.units_public
WITH (security_invoker = true) AS
SELECT
  id, property_id, name, description, capacity, base_price, weekend_price,
  cleaning_fee, min_nights, amenities, photos, group_id, is_active,
  sort_order, weekly_rate, monthly_rate, max_extra_beds, extra_bed_fee,
  pricing_type, reviews_enabled, rules, house_rules_detail,
  created_at, updated_at
FROM public.units
WHERE is_active = true;
GRANT SELECT ON public.units_public TO anon, authenticated;

-- Admin-only RPC to pre-fill the unit edit form.
CREATE OR REPLACE FUNCTION public.get_unit_private_fields(_unit_id uuid)
RETURNS TABLE (
  wifi_network text,
  wifi_password text,
  emergency_contact_name text,
  emergency_contact_phone text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT u.wifi_network, u.wifi_password, u.emergency_contact_name, u.emergency_contact_phone
    FROM public.units u WHERE u.id = _unit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_unit_private_fields(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unit_private_fields(uuid) TO authenticated;
