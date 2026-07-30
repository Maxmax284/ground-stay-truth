-- =============================================================================
-- Admin Alert Command Center — wire up the remaining event call sites.
-- Each trigger is SECURITY DEFINER, fail-soft (never blocks the write) and
-- calls public.emit_admin_alert(), which fans out to bell + email per prefs.
-- =============================================================================

-- ------------------------------------------------------------------ bookings
CREATE OR REPLACE FUNCTION public.trg_alert_booking_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _guest text; _unit text;
BEGIN
  IF NEW.state IN ('cancelled','completed','no_show') THEN RETURN NEW; END IF;
  IF NEW.check_in IS NOT DISTINCT FROM OLD.check_in
     AND NEW.check_out IS NOT DISTINCT FROM OLD.check_out
     AND NEW.unit_id IS NOT DISTINCT FROM OLD.unit_id
     AND NEW.num_guests IS NOT DISTINCT FROM OLD.num_guests THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, email, 'Guest') INTO _guest FROM public.profiles WHERE user_id = NEW.guest_id;
  SELECT name INTO _unit FROM public.units WHERE id = NEW.unit_id;

  PERFORM public.emit_admin_alert(
    'booking_changed',
    'Booking updated: ' || COALESCE(_guest, COALESCE(NEW.manual_guest_name,'Guest'))
      || ' — ' || COALESCE(_unit,'') || ' (' || NEW.check_in::text || '→' || NEW.check_out::text || ')',
    NEW.id,
    '/bookings?id=' || NEW.id::text,
    jsonb_build_object(
      'guest_name', _guest, 'unit_name', _unit,
      'old_check_in', OLD.check_in, 'new_check_in', NEW.check_in,
      'old_check_out', OLD.check_out, 'new_check_out', NEW.check_out,
      'old_num_guests', OLD.num_guests, 'new_num_guests', NEW.num_guests,
      'unit_changed', (OLD.unit_id IS DISTINCT FROM NEW.unit_id)
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_alert_booking_changed: %', SQLERRM; RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS alert_booking_changed ON public.bookings;
CREATE TRIGGER alert_booking_changed
AFTER UPDATE ON public.bookings FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_booking_changed();

CREATE OR REPLACE FUNCTION public.trg_alert_booking_created_extras()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _guest text; _email text; _unit text; _nights int;
BEGIN
  SELECT COALESCE(full_name, email, 'Guest'), email INTO _guest, _email
    FROM public.profiles WHERE user_id = NEW.guest_id;
  SELECT name INTO _unit FROM public.units WHERE id = NEW.unit_id;
  _nights := GREATEST(0, NEW.check_out - NEW.check_in);

  IF _nights >= 14 THEN
    PERFORM public.emit_admin_alert(
      'long_stay_booking',
      'Long stay: ' || COALESCE(_guest, COALESCE(NEW.manual_guest_name,'Guest'))
        || ' — ' || _nights::text || ' nights in ' || COALESCE(_unit,''),
      NEW.id, '/bookings?id=' || NEW.id::text,
      jsonb_build_object('guest_name', _guest, 'unit_name', _unit, 'nights', _nights,
                         'check_in', NEW.check_in, 'check_out', NEW.check_out,
                         'total_price', NEW.total_price)
    );
  END IF;

  IF NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM NEW.guest_id THEN
    PERFORM public.emit_admin_alert(
      'manual_booking_created',
      'Staff-created booking: ' || COALESCE(_guest, COALESCE(NEW.manual_guest_name,'Guest'))
        || ' — ' || COALESCE(_unit,'') || ' (' || NEW.check_in::text || '→' || NEW.check_out::text || ')',
      NEW.id, '/bookings?id=' || NEW.id::text,
      jsonb_build_object('guest_name', _guest, 'unit_name', _unit, 'created_by', NEW.created_by)
    );
  END IF;

  IF COALESCE(NULLIF(trim(_email), ''), NULLIF(trim(NEW.manual_guest_email), '')) IS NULL THEN
    PERFORM public.emit_admin_alert(
      'guest_has_no_email',
      'No email on file for ' || COALESCE(_guest, COALESCE(NEW.manual_guest_name,'this guest'))
        || ' — confirmations cannot be sent.',
      NEW.id, '/bookings?id=' || NEW.id::text,
      jsonb_build_object('guest_name', _guest, 'unit_name', _unit)
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_alert_booking_created_extras: %', SQLERRM; RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS alert_booking_created_extras ON public.bookings;
CREATE TRIGGER alert_booking_created_extras
AFTER INSERT ON public.bookings FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_booking_created_extras();

-- ------------------------------------------------------------------ payments
CREATE OR REPLACE FUNCTION public.trg_alert_payment_failed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _guest text;
BEGIN
  IF NEW.status <> 'failed' OR OLD.status = 'failed' THEN RETURN NEW; END IF;
  SELECT COALESCE(p.full_name, p.email, 'Guest') INTO _guest
    FROM public.bookings b LEFT JOIN public.profiles p ON p.user_id = b.guest_id
    WHERE b.id = NEW.booking_id;

  PERFORM public.emit_admin_alert(
    'payment_failed',
    'Payment failed: ' || COALESCE(_guest,'Guest') || ' — ' || NEW.amount::text
      || ' (' || COALESCE(NEW.payment_type,'payment') || ')',
    NEW.booking_id, '/bookings?id=' || COALESCE(NEW.booking_id::text,''),
    jsonb_build_object('guest_name', _guest, 'amount', NEW.amount,
                       'payment_type', NEW.payment_type, 'provider', NEW.provider,
                       'provider_status', NEW.provider_status, 'payment_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_alert_payment_failed: %', SQLERRM; RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS alert_payment_failed ON public.payments;
CREATE TRIGGER alert_payment_failed
AFTER UPDATE ON public.payments FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_payment_failed();

CREATE OR REPLACE FUNCTION public.trg_alert_pickup_fee_added()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _guest text;
BEGIN
  IF NEW.payment_type <> 'addon' OR COALESCE(NEW.description,'') NOT ILIKE '%pickup%' THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(p.full_name, p.email, 'Guest') INTO _guest
    FROM public.bookings b LEFT JOIN public.profiles p ON p.user_id = b.guest_id
    WHERE b.id = NEW.booking_id;

  PERFORM public.emit_admin_alert(
    'pickup_fee_added',
    'Pickup fee added: ' || COALESCE(_guest,'Guest') || ' — ' || NEW.amount::text,
    NEW.booking_id, '/bookings?id=' || COALESCE(NEW.booking_id::text,''),
    jsonb_build_object('guest_name', _guest, 'amount', NEW.amount, 'payment_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_alert_pickup_fee_added: %', SQLERRM; RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS alert_pickup_fee_added ON public.payments;
CREATE TRIGGER alert_pickup_fee_added
AFTER INSERT ON public.payments FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_pickup_fee_added();

CREATE OR REPLACE FUNCTION public.trg_alert_payment_link_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _guest text;
BEGIN
  SELECT COALESCE(p.full_name, p.email, 'Guest') INTO _guest
    FROM public.bookings b LEFT JOIN public.profiles p ON p.user_id = b.guest_id
    WHERE b.id = NEW.booking_id;

  PERFORM public.emit_admin_alert(
    'payment_link_created',
    'Payment link created for ' || COALESCE(_guest,'Guest') || ' — ' || NEW.amount::text,
    NEW.booking_id, '/bookings?id=' || NEW.booking_id::text,
    jsonb_build_object('guest_name', _guest, 'amount', NEW.amount,
                       'expires_at', NEW.expires_at, 'created_by', NEW.created_by)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_alert_payment_link_created: %', SQLERRM; RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS alert_payment_link_created ON public.payment_links;
CREATE TRIGGER alert_payment_link_created
AFTER INSERT ON public.payment_links FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_payment_link_created();

-- ------------------------------------------------------- rooms / maintenance
CREATE OR REPLACE FUNCTION public.trg_alert_maintenance_block()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _unit text; _row record;
BEGIN
  _row := COALESCE(NEW, OLD);
  SELECT name INTO _unit FROM public.units WHERE id = _row.unit_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_admin_alert(
      'maintenance_block_created',
      'Room out of service: ' || COALESCE(_unit,'unit') || ' (' || _row.start_date::text
        || '→' || _row.end_date::text || ')',
      _row.id, '/calendar',
      jsonb_build_object('unit_name', _unit, 'start_date', _row.start_date,
                         'end_date', _row.end_date, 'reason', _row.reason)
    );
  ELSE
    PERFORM public.emit_admin_alert(
      'maintenance_block_resolved',
      'Room back in service: ' || COALESCE(_unit,'unit') || ' (' || _row.start_date::text
        || '→' || _row.end_date::text || ')',
      _row.id, '/calendar',
      jsonb_build_object('unit_name', _unit, 'start_date', _row.start_date, 'end_date', _row.end_date)
    );
  END IF;
  RETURN _row;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_alert_maintenance_block: %', SQLERRM; RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS alert_maintenance_block_created ON public.maintenance_blocks;
CREATE TRIGGER alert_maintenance_block_created
AFTER INSERT ON public.maintenance_blocks FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_maintenance_block();

DROP TRIGGER IF EXISTS alert_maintenance_block_resolved ON public.maintenance_blocks;
CREATE TRIGGER alert_maintenance_block_resolved
AFTER DELETE ON public.maintenance_blocks FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_maintenance_block();

CREATE OR REPLACE FUNCTION public.trg_alert_room_unavailable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.is_active IS NOT TRUE OR NEW.is_active IS NOT FALSE THEN RETURN NEW; END IF;
  PERFORM public.emit_admin_alert(
    'room_unavailable',
    'Room deactivated: ' || COALESCE(NEW.name,'unit') || ' is no longer bookable.',
    NEW.id, '/units',
    jsonb_build_object('unit_name', NEW.name, 'unit_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_alert_room_unavailable: %', SQLERRM; RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS alert_room_unavailable ON public.units;
CREATE TRIGGER alert_room_unavailable
AFTER UPDATE ON public.units FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_room_unavailable();

-- ----------------------------------------------------------- adjustments
CREATE OR REPLACE FUNCTION public.trg_alert_booking_adjustment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _guest text;
BEGIN
  SELECT COALESCE(p.full_name, p.email, 'Guest') INTO _guest
    FROM public.bookings b LEFT JOIN public.profiles p ON p.user_id = b.guest_id
    WHERE b.id = NEW.booking_id;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'active' THEN RETURN NEW; END IF;
    PERFORM public.emit_admin_alert(
      'admin_discount_applied',
      'Adjustment applied: ' || COALESCE(NEW.label,'adjustment') || ' — '
        || COALESCE(_guest,'Guest') || ' (' || NEW.amount_calculated::text || ')',
      NEW.booking_id, '/bookings?id=' || NEW.booking_id::text,
      jsonb_build_object('guest_name', _guest, 'label', NEW.label,
                         'adjustment_type', NEW.adjustment_type, 'value', NEW.value,
                         'value_type', NEW.value_type, 'amount', NEW.amount_calculated,
                         'applied_by', NEW.applied_by)
    );
  ELSE
    IF NEW.status <> 'voided' OR OLD.status = 'voided' THEN RETURN NEW; END IF;
    PERFORM public.emit_admin_alert(
      'booking_adjustment_voided',
      'Adjustment voided: ' || COALESCE(NEW.label,'adjustment') || ' — ' || COALESCE(_guest,'Guest'),
      NEW.booking_id, '/bookings?id=' || NEW.booking_id::text,
      jsonb_build_object('guest_name', _guest, 'label', NEW.label,
                         'amount', NEW.amount_calculated, 'void_reason', NEW.void_reason,
                         'voided_by', NEW.voided_by)
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_alert_booking_adjustment: %', SQLERRM; RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS alert_booking_adjustment_applied ON public.booking_adjustments;
CREATE TRIGGER alert_booking_adjustment_applied
AFTER INSERT ON public.booking_adjustments FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_booking_adjustment();

DROP TRIGGER IF EXISTS alert_booking_adjustment_voided ON public.booking_adjustments;
CREATE TRIGGER alert_booking_adjustment_voided
AFTER UPDATE ON public.booking_adjustments FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_booking_adjustment();

-- ------------------------------------------------------------- guest notes
CREATE OR REPLACE FUNCTION public.trg_alert_guest_note_added()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _guest text;
BEGIN
  SELECT COALESCE(full_name, email, 'Guest') INTO _guest FROM public.profiles WHERE user_id = NEW.guest_id;
  PERFORM public.emit_admin_alert(
    'guest_note_added',
    'Note added for ' || COALESCE(_guest,'a guest') || ': ' || left(COALESCE(NEW.note,''), 100),
    NEW.id, '/bookings?tab=guests',
    jsonb_build_object('guest_name', _guest, 'preview', left(COALESCE(NEW.note,''), 160),
                       'created_by', NEW.created_by)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_alert_guest_note_added: %', SQLERRM; RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS alert_guest_note_added ON public.guest_notes;
CREATE TRIGGER alert_guest_note_added
AFTER INSERT ON public.guest_notes FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_guest_note_added();

-- ---------------------------------------------------------------- laundry
CREATE OR REPLACE FUNCTION public.trg_alert_laundry_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _unit text; _verb text;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.status IS NOT DISTINCT FROM OLD.status
      OR NEW.status NOT IN ('ready','completed','delivered')) THEN
    RETURN NEW;
  END IF;
  SELECT name INTO _unit FROM public.units WHERE id = NEW.unit_id;
  _verb := CASE WHEN TG_OP = 'INSERT' THEN 'raised' ELSE NEW.status END;

  PERFORM public.emit_admin_alert(
    'laundry_request',
    'Laundry ' || _verb || ': ' || COALESCE(_unit,'unit')
      || COALESCE(' · ' || NEW.bag_count::text || ' bag(s)', ''),
    NEW.id, '/front-desk',
    jsonb_build_object('unit_name', _unit, 'status', NEW.status,
                       'bag_count', NEW.bag_count, 'booking_id', NEW.booking_id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_alert_laundry_request: %', SQLERRM; RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS alert_laundry_request_created ON public.laundry_requests;
CREATE TRIGGER alert_laundry_request_created
AFTER INSERT ON public.laundry_requests FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_laundry_request();

DROP TRIGGER IF EXISTS alert_laundry_request_status ON public.laundry_requests;
CREATE TRIGGER alert_laundry_request_status
AFTER UPDATE ON public.laundry_requests FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_laundry_request();

-- ------------------------------------------------------------- documents
CREATE OR REPLACE FUNCTION public.trg_alert_guest_uploaded_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _guest text;
BEGIN
  SELECT COALESCE(p.full_name, p.email, 'Guest') INTO _guest
    FROM public.bookings b LEFT JOIN public.profiles p ON p.user_id = b.guest_id
    WHERE b.id = NEW.booking_id;

  PERFORM public.emit_admin_alert(
    'guest_uploaded_id',
    'Document uploaded: ' || COALESCE(_guest,'Guest') || ' — ' || COALESCE(NEW.document_type,'document'),
    NEW.booking_id, '/bookings?id=' || NEW.booking_id::text,
    jsonb_build_object('guest_name', _guest, 'document_type', NEW.document_type,
                       'verification_status', NEW.verification_status)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_alert_guest_uploaded_id: %', SQLERRM; RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS alert_guest_uploaded_id ON public.guest_documents;
CREATE TRIGGER alert_guest_uploaded_id
AFTER INSERT ON public.guest_documents FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_guest_uploaded_id();

-- --------------------------------------------------------- email delivery
CREATE OR REPLACE FUNCTION public.trg_alert_email_failed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _key text; _tpl text := COALESCE(NEW.template_name, '');
BEGIN
  IF NEW.status NOT IN ('failed','error','bounced') THEN RETURN NEW; END IF;
  -- Admin alert emails have their own event; never loop back on ourselves.
  IF _tpl ILIKE 'admin_alert%' THEN RETURN NEW; END IF;

  IF _tpl ILIKE '%payment%' OR _tpl ILIKE '%deposit%' THEN
    _key := 'payment_email_failed';
  ELSE
    _key := 'guest_email_failed';
  END IF;

  PERFORM public.emit_admin_alert(
    _key,
    'Email failed to ' || NEW.recipient_email || ' (' || _tpl || ')',
    NULL, '/monitoring',
    jsonb_build_object('template', _tpl, 'recipient', NEW.recipient_email,
                       'error', left(COALESCE(NEW.error_message,''), 200))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_alert_email_failed: %', SQLERRM; RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS alert_email_failed ON public.email_send_log;
CREATE TRIGGER alert_email_failed
AFTER INSERT ON public.email_send_log FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_email_failed();

-- ----------------------------------------------------- guest portal health
CREATE OR REPLACE FUNCTION public.trg_alert_guest_portal_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _key text; _msg text; _guest text;
BEGIN
  IF NEW.event_status = 'error' AND (NEW.event_type ILIKE '%upload%' OR NEW.component ILIKE '%document%') THEN
    _key := 'guest_id_upload_failed';
    _msg := 'Guest document upload failed: ' || left(COALESCE(NEW.error_message, NEW.message, ''), 120);
  ELSIF NEW.event_status = 'error' AND (NEW.event_type ILIKE '%pay%' OR NEW.component ILIKE '%pay%') THEN
    _key := 'guest_stuck_at_payment';
    _msg := 'Guest could not reach checkout: ' || left(COALESCE(NEW.error_message, NEW.message, ''), 120);
  ELSIF NEW.event_type ILIKE '%stripe%' AND NEW.event_status = 'success' THEN
    _key := 'guest_reached_stripe';
    _msg := 'Guest reached the Stripe checkout page.';
  ELSIF NEW.event_type ILIKE '%login%' OR NEW.event_type ILIKE '%signed_in%' THEN
    _key := 'guest_logged_in';
    _msg := 'Guest signed into the portal.';
  ELSIF NEW.is_in_app_browser AND (NEW.event_type ILIKE '%open%' OR NEW.event_type ILIKE '%view%') THEN
    _key := 'guest_in_app_browser';
    _msg := 'Guest opened the portal inside an in-app browser ('
            || COALESCE(NEW.browser_name,'unknown') || ') — checkout can be blocked.';
  ELSE
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, email, 'Guest') INTO _guest FROM public.profiles WHERE user_id = NEW.guest_id;

  PERFORM public.emit_admin_alert(
    _key,
    COALESCE(_guest,'Guest') || ' — ' || _msg,
    NEW.booking_id,
    CASE WHEN NEW.booking_id IS NOT NULL
         THEN '/bookings?id=' || NEW.booking_id::text ELSE '/monitoring' END,
    jsonb_build_object('guest_name', _guest, 'route', NEW.route, 'device', NEW.device_type,
                       'browser', NEW.browser_name, 'session_id', NEW.session_id,
                       'error_code', NEW.error_code)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_alert_guest_portal_activity: %', SQLERRM; RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS alert_guest_portal_activity ON public.guest_portal_activity;
CREATE TRIGGER alert_guest_portal_activity
AFTER INSERT ON public.guest_portal_activity FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_guest_portal_activity();

-- --------------------------------------------------- staff overrides / resends
CREATE OR REPLACE FUNCTION public.trg_alert_staff_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _key text;
BEGIN
  IF NEW.event_type ILIKE '%email.resend%' OR NEW.event_type ILIKE '%email_resend%' THEN
    _key := 'email_resend_performed';
  ELSIF NEW.event_type ILIKE '%override%' OR NEW.event_type ILIKE '%backdated%' THEN
    _key := 'staff_override_used';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.emit_admin_alert(
    _key,
    COALESCE(NEW.actor_email, 'A staff member') || ' — ' || NEW.event_type
      || COALESCE(': ' || left(NEW.reason, 120), ''),
    NEW.id, '/monitoring',
    jsonb_build_object('actor', NEW.actor_email, 'actor_role', NEW.actor_role,
                       'event', NEW.event_type, 'reason', NEW.reason)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_alert_staff_audit: %', SQLERRM; RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS alert_staff_audit ON public.staff_audit_events;
CREATE TRIGGER alert_staff_audit
AFTER INSERT ON public.staff_audit_events FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_staff_audit();

-- ------------------------------------------------------------ client errors
CREATE OR REPLACE FUNCTION public.trg_alert_client_error()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF COALESCE(NEW.category,'') <> 'client_error' OR COALESCE(NEW.outcome,'') <> 'failure' THEN
    RETURN NEW;
  END IF;
  PERFORM public.emit_admin_alert(
    'client_error',
    'App error: ' || COALESCE(NEW.action,'unknown action') || ' — '
      || left(COALESCE(NEW.failure_reason,''), 140),
    NEW.id, '/monitoring',
    jsonb_build_object('action', NEW.action, 'reason', left(COALESCE(NEW.failure_reason,''), 200),
                       'details', NEW.details)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_alert_client_error: %', SQLERRM; RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS alert_client_error ON public.recovery_audit_log;
CREATE TRIGGER alert_client_error
AFTER INSERT ON public.recovery_audit_log FOR EACH ROW
EXECUTE FUNCTION public.trg_alert_client_error();