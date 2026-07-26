CREATE OR REPLACE FUNCTION public.sync_pickup_fee_obligation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _booking_id uuid;
  _fee numeric;
  _active boolean;
  _existing_pending uuid;
  _existing_recorded uuid;
  _desc text := 'Airport pickup fee';
BEGIN
  IF TG_OP = 'DELETE' THEN
    _booking_id := OLD.booking_id;
    _fee := 0;
    _active := false;
  ELSE
    _booking_id := NEW.booking_id;
    _fee := COALESCE(NEW.fee, 0);
    _active := COALESCE(NEW.pickup_enabled, true)
               AND COALESCE(NEW.status, '') NOT IN ('cancelled','declined')
               AND _fee > 0;
  END IF;

  IF _booking_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Already collected? Leave it alone.
  SELECT id INTO _existing_recorded
  FROM public.payments
  WHERE booking_id = _booking_id
    AND payment_type = 'addon'
    AND description = _desc
    AND status IN ('recorded','partially_refunded','refunded')
  LIMIT 1;

  IF _existing_recorded IS NOT NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT id INTO _existing_pending
  FROM public.payments
  WHERE booking_id = _booking_id
    AND payment_type = 'addon'
    AND description = _desc
    AND status = 'pending'
  LIMIT 1;

  IF NOT _active THEN
    IF _existing_pending IS NOT NULL THEN
      UPDATE public.payments
      SET status = 'cancelled', updated_at = now()
      WHERE id = _existing_pending;
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF _existing_pending IS NOT NULL THEN
    UPDATE public.payments
    SET amount = _fee, updated_at = now()
    WHERE id = _existing_pending AND amount IS DISTINCT FROM _fee;
  ELSE
    INSERT INTO public.payments
      (booking_id, amount, method, status, provider, provider_status, payment_type, description, source_channel)
    VALUES
      (_booking_id, _fee, 'pending', 'pending', 'pending', 'awaiting', 'addon', _desc, 'system');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS sync_pickup_fee_obligation_trg ON public.airport_pickups;
CREATE TRIGGER sync_pickup_fee_obligation_trg
AFTER INSERT OR UPDATE OF fee, status, pickup_enabled OR DELETE ON public.airport_pickups
FOR EACH ROW EXECUTE FUNCTION public.sync_pickup_fee_obligation();