
CREATE OR REPLACE FUNCTION public.auto_create_pending_deposit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pct numeric;
  amt numeric;
  existing uuid;
BEGIN
  IF NEW.total_price IS NULL OR NEW.total_price <= 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.state NOT IN ('soft_hold','pending_approval','pending_deposit') THEN
    RETURN NEW;
  END IF;

  -- Skip if any deposit already exists for this booking (pending OR recorded)
  SELECT id INTO existing
  FROM public.payments
  WHERE booking_id = NEW.id
    AND payment_type = 'deposit'
    AND status IN ('pending','recorded')
  LIMIT 1;
  IF existing IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(regexp_replace(value::text, '"', '', 'g'), '')::numeric
    INTO pct
  FROM public.policy_settings
  WHERE key = 'deposit_percentage'
  LIMIT 1;
  IF pct IS NULL OR pct <= 0 THEN pct := 20; END IF;

  amt := round((NEW.total_price * pct) / 100.0, 2);
  IF amt <= 0 THEN RETURN NEW; END IF;

  INSERT INTO public.payments
    (booking_id, amount, method, status, provider, provider_status, payment_type, description, source_channel)
  VALUES
    (NEW.id, amt, 'pending', 'pending', 'pending', 'awaiting',
     'deposit',
     'Auto-created deposit obligation (' || pct::text || '% of booking total)',
     'system');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_pending_deposit_ins ON public.bookings;
CREATE TRIGGER trg_auto_create_pending_deposit_ins
AFTER INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_pending_deposit();

DROP TRIGGER IF EXISTS trg_auto_create_pending_deposit_upd ON public.bookings;
CREATE TRIGGER trg_auto_create_pending_deposit_upd
AFTER UPDATE OF state ON public.bookings
FOR EACH ROW
WHEN (OLD.state IS DISTINCT FROM NEW.state)
EXECUTE FUNCTION public.auto_create_pending_deposit();
