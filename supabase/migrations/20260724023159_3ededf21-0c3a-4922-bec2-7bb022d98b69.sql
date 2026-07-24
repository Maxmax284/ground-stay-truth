
-- Store internal auth token for DB→edge-function admin alert bridge.
INSERT INTO public.integration_secrets (secret_key, encrypted_value)
VALUES ('admin_alert_internal_token', '4u0kzM5oyxavIcAYDj3eMZPjND4Evh5p1PGGL1XYdoM')
ON CONFLICT (secret_key) DO UPDATE
  SET encrypted_value = EXCLUDED.encrypted_value, updated_at = now();

-- Helper: fire admin alert via pg_net → emit-admin-alert edge function.
CREATE OR REPLACE FUNCTION public.emit_admin_alert(
  _event_type text,
  _message text,
  _reference_id uuid,
  _deep_link text,
  _context jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _token text;
  _edge_url text := 'https://eglgvhnkwhozjnenwjxd.supabase.co/functions/v1/emit-admin-alert';
BEGIN
  _token := public.get_integration_secret('admin_alert_internal_token');
  IF _token IS NULL OR length(_token) < 8 THEN
    RAISE WARNING 'emit_admin_alert: internal token not configured';
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := _edge_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'internal_token', _token,
        'event_type', _event_type,
        'message', _message,
        'reference_id', _reference_id,
        'deep_link', _deep_link,
        'context', COALESCE(_context, '{}'::jsonb)
      ),
      timeout_milliseconds := 1500
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'emit_admin_alert dispatch failed: %', SQLERRM;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.emit_admin_alert(text, text, uuid, text, jsonb) TO service_role, authenticated;

-- 1) New booking request: any INSERT with guest-initiated state.
CREATE OR REPLACE FUNCTION public.trg_alert_new_booking_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _guest_name text;
  _unit_name text;
BEGIN
  IF NEW.state NOT IN ('inquiry','soft_hold','pending_approval','pending_deposit') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, email, 'Guest') INTO _guest_name
    FROM public.profiles WHERE user_id = NEW.guest_id;
  SELECT name INTO _unit_name FROM public.units WHERE id = NEW.unit_id;

  PERFORM public.emit_admin_alert(
    'new_booking_request',
    COALESCE(_guest_name,'Guest') || ' requested ' || COALESCE(_unit_name,'a unit')
      || ' — ' || NEW.check_in::text || ' → ' || NEW.check_out::text,
    NEW.id,
    '/bookings?id=' || NEW.id::text,
    jsonb_build_object(
      'guest_name', _guest_name,
      'unit_name', _unit_name,
      'check_in', NEW.check_in,
      'check_out', NEW.check_out,
      'num_guests', NEW.num_guests,
      'total_price', NEW.total_price,
      'state', NEW.state
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alert_new_booking_request ON public.bookings;
CREATE TRIGGER alert_new_booking_request
AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_alert_new_booking_request();

-- 2) Booking cancelled: state transition to cancelled.
CREATE OR REPLACE FUNCTION public.trg_alert_booking_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _guest_name text;
  _unit_name text;
BEGIN
  IF NEW.state IS NOT DISTINCT FROM OLD.state OR NEW.state <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, email, 'Guest') INTO _guest_name
    FROM public.profiles WHERE user_id = NEW.guest_id;
  SELECT name INTO _unit_name FROM public.units WHERE id = NEW.unit_id;

  PERFORM public.emit_admin_alert(
    'booking_cancelled',
    'Cancelled: ' || COALESCE(_guest_name,'Guest') || ' — ' || COALESCE(_unit_name,'')
      || ' (' || NEW.check_in::text || '→' || NEW.check_out::text || ')',
    NEW.id,
    '/bookings?id=' || NEW.id::text,
    jsonb_build_object(
      'guest_name', _guest_name,
      'unit_name', _unit_name,
      'previous_state', OLD.state,
      'check_in', NEW.check_in,
      'check_out', NEW.check_out
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alert_booking_cancelled ON public.bookings;
CREATE TRIGGER alert_booking_cancelled
AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_alert_booking_cancelled();

-- 3) Airport pickup requested.
CREATE OR REPLACE FUNCTION public.trg_alert_pickup_requested()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _guest_name text;
BEGIN
  SELECT COALESCE(p.full_name, p.email, 'Guest') INTO _guest_name
    FROM public.bookings b
    LEFT JOIN public.profiles p ON p.user_id = b.guest_id
    WHERE b.id = NEW.booking_id;

  PERFORM public.emit_admin_alert(
    'airport_pickup_requested',
    'Pickup requested: ' || COALESCE(_guest_name,'Guest')
      || COALESCE(' · ' || NEW.flight_number, '')
      || COALESCE(' · ' || NEW.arrival_datetime::text, ''),
    NEW.booking_id,
    '/bookings?id=' || NEW.booking_id::text,
    jsonb_build_object(
      'guest_name', _guest_name,
      'pickup_id', NEW.id,
      'flight_number', NEW.flight_number,
      'arrival_datetime', NEW.arrival_datetime
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alert_pickup_requested ON public.airport_pickups;
CREATE TRIGGER alert_pickup_requested
AFTER INSERT ON public.airport_pickups
FOR EACH ROW EXECUTE FUNCTION public.trg_alert_pickup_requested();

-- 4) Guest message received: skip internal/draft, only when sender is booking's guest.
CREATE OR REPLACE FUNCTION public.trg_alert_guest_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_guest boolean;
  _guest_name text;
BEGIN
  IF NEW.is_internal IS TRUE OR COALESCE(NEW.draft, false) IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = NEW.booking_id AND b.guest_id = NEW.sender_id
  ) INTO _is_guest;

  IF NOT _is_guest THEN RETURN NEW; END IF;

  SELECT COALESCE(full_name, email, 'Guest') INTO _guest_name
    FROM public.profiles WHERE user_id = NEW.sender_id;

  PERFORM public.emit_admin_alert(
    'guest_message_received',
    'Message from ' || COALESCE(_guest_name,'Guest') || ': ' || left(COALESCE(NEW.content, ''), 100),
    NEW.booking_id,
    '/messages?booking=' || NEW.booking_id::text,
    jsonb_build_object(
      'guest_name', _guest_name,
      'message_id', NEW.id,
      'preview', left(COALESCE(NEW.content, ''), 160),
      'has_attachment', NEW.attachment_url IS NOT NULL
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alert_guest_message ON public.messages;
CREATE TRIGGER alert_guest_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.trg_alert_guest_message();

-- 5) Payment recorded → deposit_paid or balance_paid.
CREATE OR REPLACE FUNCTION public.trg_alert_payment_recorded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _guest_name text;
  _unit_name text;
  _event_type text;
BEGIN
  IF NEW.status <> 'recorded' OR OLD.status = 'recorded' THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_type = 'deposit' THEN
    _event_type := 'deposit_paid';
  ELSIF NEW.payment_type = 'balance' THEN
    _event_type := 'balance_paid';
  ELSE
    RETURN NEW; -- ignore booking_fee, security_deposit, refund, etc. for this phase
  END IF;

  SELECT COALESCE(p.full_name, p.email, 'Guest'), u.name
    INTO _guest_name, _unit_name
    FROM public.bookings b
    LEFT JOIN public.profiles p ON p.user_id = b.guest_id
    LEFT JOIN public.units u ON u.id = b.unit_id
    WHERE b.id = NEW.booking_id;

  PERFORM public.emit_admin_alert(
    _event_type,
    (CASE _event_type WHEN 'deposit_paid' THEN 'Deposit paid' ELSE 'Balance paid' END)
      || ': ' || COALESCE(_guest_name,'Guest')
      || ' — ' || COALESCE(_unit_name,'')
      || ' · ' || NEW.amount::text,
    NEW.booking_id,
    '/bookings?id=' || COALESCE(NEW.booking_id::text,''),
    jsonb_build_object(
      'guest_name', _guest_name,
      'unit_name', _unit_name,
      'amount', NEW.amount,
      'method', NEW.method,
      'provider', NEW.provider,
      'payment_id', NEW.id
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alert_payment_recorded ON public.payments;
CREATE TRIGGER alert_payment_recorded
AFTER UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.trg_alert_payment_recorded();
