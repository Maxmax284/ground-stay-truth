-- Seed global booking fee defaults (skip if already present)
INSERT INTO public.policy_settings (key, value, description, property_id)
SELECT 'booking_fee_enabled', 'false'::jsonb,
       'Master toggle for booking fees. When false, no booking fee obligations are created. Override per property.',
       NULL
WHERE NOT EXISTS (SELECT 1 FROM public.policy_settings WHERE key='booking_fee_enabled' AND property_id IS NULL);

INSERT INTO public.policy_settings (key, value, description, property_id)
SELECT 'booking_fee_mode', '"separate"'::jsonb,
       'Fee display: "included" (rolled into price), "separate" (own line), or "hidden" (internal tracking).',
       NULL
WHERE NOT EXISTS (SELECT 1 FROM public.policy_settings WHERE key='booking_fee_mode' AND property_id IS NULL);

INSERT INTO public.policy_settings (key, value, description, property_id)
SELECT 'booking_fee_percentage', '0'::jsonb,
       'Percentage of booking total charged as a booking fee (0 = off).',
       NULL
WHERE NOT EXISTS (SELECT 1 FROM public.policy_settings WHERE key='booking_fee_percentage' AND property_id IS NULL);

INSERT INTO public.policy_settings (key, value, description, property_id)
SELECT 'booking_fee_fixed', '0'::jsonb,
       'Flat amount charged as a booking fee, added on top of the percentage.',
       NULL
WHERE NOT EXISTS (SELECT 1 FROM public.policy_settings WHERE key='booking_fee_fixed' AND property_id IS NULL);

-- Trigger function: auto-create pending booking fee
CREATE OR REPLACE FUNCTION public.auto_create_pending_booking_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enabled boolean;
  mode text;
  pct numeric;
  fixed numeric;
  amt numeric;
  existing uuid;
  prop uuid := NEW.property_id;
BEGIN
  IF NEW.state NOT IN ('soft_hold','pending_approval','pending_deposit') THEN
    RETURN NEW;
  END IF;

  SELECT (NULLIF(regexp_replace(value::text,'"','','g'),'')::boolean)
    INTO enabled
  FROM public.policy_settings
  WHERE key = 'booking_fee_enabled'
    AND (property_id = prop OR property_id IS NULL)
  ORDER BY property_id NULLS LAST
  LIMIT 1;

  IF enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(regexp_replace(value::text,'"','','g'),'')
    INTO mode
  FROM public.policy_settings
  WHERE key = 'booking_fee_mode'
    AND (property_id = prop OR property_id IS NULL)
  ORDER BY property_id NULLS LAST
  LIMIT 1;
  mode := COALESCE(mode, 'separate');

  IF mode = 'included' THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(regexp_replace(value::text,'"','','g'),'')::numeric
    INTO pct
  FROM public.policy_settings
  WHERE key = 'booking_fee_percentage'
    AND (property_id = prop OR property_id IS NULL)
  ORDER BY property_id NULLS LAST
  LIMIT 1;

  SELECT NULLIF(regexp_replace(value::text,'"','','g'),'')::numeric
    INTO fixed
  FROM public.policy_settings
  WHERE key = 'booking_fee_fixed'
    AND (property_id = prop OR property_id IS NULL)
  ORDER BY property_id NULLS LAST
  LIMIT 1;

  pct := COALESCE(pct, 0);
  fixed := COALESCE(fixed, 0);
  amt := ROUND(((COALESCE(NEW.total_price,0) * pct) / 100.0) + fixed, 2);

  IF amt <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO existing
  FROM public.payments
  WHERE booking_id = NEW.id
    AND payment_type = 'booking_fee'
    AND status IN ('pending','recorded')
  LIMIT 1;
  IF existing IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.payments
    (booking_id, amount, method, status, provider, provider_status, payment_type, description, source_channel)
  VALUES
    (NEW.id, amt, 'pending', 'pending', 'pending', 'awaiting',
     'booking_fee',
     'Auto-created booking fee obligation' ||
       CASE WHEN pct > 0 AND fixed > 0 THEN ' (' || pct::text || '% + ' || fixed::text || ' fixed)'
            WHEN pct > 0 THEN ' (' || pct::text || '% of total)'
            ELSE ' (' || fixed::text || ' flat)' END,
     'system');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_pending_booking_fee ON public.bookings;
CREATE TRIGGER trg_auto_create_pending_booking_fee
AFTER INSERT OR UPDATE OF state, total_price ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_pending_booking_fee();