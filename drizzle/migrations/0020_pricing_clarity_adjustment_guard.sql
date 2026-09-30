INSERT INTO public.policy_settings (key, value, description)
SELECT 'large_adjustment_alert_threshold', '10000'::jsonb,
  'Admins get a "Large pricing adjustment recorded" alert when a single manual discount or waiver reaches this amount (฿). Visibility only.'
WHERE NOT EXISTS (SELECT 1 FROM public.policy_settings WHERE key='large_adjustment_alert_threshold' AND property_id IS NULL);

CREATE OR REPLACE FUNCTION public.guard_booking_adjustment_history()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.adjustment_type IS DISTINCT FROM OLD.adjustment_type
     OR NEW.value_type IS DISTINCT FROM OLD.value_type
     OR NEW.value IS DISTINCT FROM OLD.value
     OR NEW.amount_calculated IS DISTINCT FROM OLD.amount_calculated
     OR NEW.label IS DISTINCT FROM OLD.label
     OR NEW.internal_note IS DISTINCT FROM OLD.internal_note
     OR NEW.applied_by IS DISTINCT FROM OLD.applied_by
     OR NEW.applied_at IS DISTINCT FROM OLD.applied_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Adjustment history is read-only. Void it and apply a new one instead.';
  END IF;
  IF OLD.status <> 'active' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'A voided or superseded adjustment cannot be reactivated.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_booking_adjustment_history ON public.booking_adjustments;
CREATE TRIGGER guard_booking_adjustment_history
BEFORE UPDATE ON public.booking_adjustments
FOR EACH ROW EXECUTE FUNCTION public.guard_booking_adjustment_history();

CREATE OR REPLACE FUNCTION public.block_booking_adjustment_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') IN ('authenticated','anon') THEN
    RAISE EXCEPTION 'Adjustment records cannot be deleted.';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS block_booking_adjustment_delete ON public.booking_adjustments;
CREATE TRIGGER block_booking_adjustment_delete
BEFORE DELETE ON public.booking_adjustments
FOR EACH ROW EXECUTE FUNCTION public.block_booking_adjustment_delete();