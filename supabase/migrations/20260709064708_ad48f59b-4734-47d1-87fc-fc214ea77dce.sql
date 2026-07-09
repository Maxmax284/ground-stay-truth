
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
