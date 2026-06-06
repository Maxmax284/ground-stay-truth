CREATE OR REPLACE FUNCTION public.auto_create_pending_security_deposit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  required boolean;
  amt numeric;
  existing uuid;
  prop uuid := NEW.property_id;
BEGIN
  IF NEW.state NOT IN ('soft_hold','pending_approval','pending_deposit') THEN
    RETURN NEW;
  END IF;

  -- Property-scoped first, then global fallback
  SELECT (NULLIF(regexp_replace(value::text,'"','','g'),'')::boolean)
    INTO required
  FROM public.policy_settings
  WHERE key = 'security_deposit_required'
    AND (property_id = prop OR property_id IS NULL)
  ORDER BY property_id NULLS LAST
  LIMIT 1;

  IF required IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(regexp_replace(value::text,'"','','g'),'')::numeric
    INTO amt
  FROM public.policy_settings
  WHERE key = 'security_deposit_amount'
    AND (property_id = prop OR property_id IS NULL)
  ORDER BY property_id NULLS LAST
  LIMIT 1;

  IF amt IS NULL OR amt <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO existing
  FROM public.payments
  WHERE booking_id = NEW.id
    AND payment_type = 'security_deposit'
    AND status IN ('pending','recorded')
  LIMIT 1;
  IF existing IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.payments
    (booking_id, amount, method, status, provider, provider_status, payment_type, description, source_channel)
  VALUES
    (NEW.id, amt, 'pending', 'pending', 'pending', 'awaiting',
     'security_deposit',
     'Auto-created security deposit obligation',
     'system');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_pending_security_deposit ON public.bookings;
CREATE TRIGGER trg_auto_create_pending_security_deposit
AFTER INSERT OR UPDATE OF state ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_pending_security_deposit();