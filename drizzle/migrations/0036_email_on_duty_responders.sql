CREATE OR REPLACE FUNCTION public.email_on_duty_responder() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid text := NEW.meta->>'user';
BEGIN
  IF NEW.action NOT IN ('notified_primary','escalated_backup') OR uid IS NULL THEN RETURN NEW; END IF;
  BEGIN
    PERFORM public.emit_admin_alert('urgent_guest_request_escalated',
      CASE WHEN NEW.action='notified_primary' THEN 'Urgent guest request — you are on duty'
           ELSE 'Urgent guest request not acknowledged — you are backup' END,
      NEW.booking_id, '/front-desk',
      jsonb_build_object('booking_id', NEW.booking_id, 'escalation_id', NEW.escalation_id,
                         'responder_user_id', uid, 'dedupe_key', 'esc-evt-' || NEW.id));
  EXCEPTION WHEN others THEN NULL; END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_email_on_duty_responder ON public.guest_escalation_events;
CREATE TRIGGER trg_email_on_duty_responder AFTER INSERT ON public.guest_escalation_events
  FOR EACH ROW EXECUTE FUNCTION public.email_on_duty_responder();