-- Allow public read of pricing_rules so the guest-facing calculator on /stay
-- can apply seasonal rates (High Season, Peak Season, etc). Without this the
-- calculator silently falls back to base_price and quotes the wrong nightly rate.
CREATE POLICY "Public can read pricing rules"
  ON public.pricing_rules
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.pricing_rules TO anon;
GRANT SELECT ON public.pricing_rules TO authenticated;

-- Allow anon + authenticated to call the auto-assign RPC. It's SECURITY DEFINER
-- and only picks a free sibling unit for the requested dates — safe to expose
-- so guests on /stay can actually see "available" for room types with free rooms.
GRANT EXECUTE ON FUNCTION public.assign_unit_for_group(uuid, date, date) TO anon;
GRANT EXECUTE ON FUNCTION public.assign_unit_for_group(uuid, date, date) TO authenticated;