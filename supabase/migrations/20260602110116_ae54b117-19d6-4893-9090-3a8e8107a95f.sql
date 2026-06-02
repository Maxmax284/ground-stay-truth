INSERT INTO public.integration_secrets (secret_key, encrypted_value, description, updated_at)
VALUES (
  'vanta_internal_token',
  'vti_' || translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_'),
  'Internal token for database-triggered Vanta signal dispatch',
  now()
)
ON CONFLICT (secret_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.emit_vanta_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _event_type text;
  _payload jsonb;
  _idempotency_key text;
  _internal_token text;
  _edge_url text := 'https://eglgvhnkwhozjnenwjxd.supabase.co/functions/v1/vanta-emit';
  _is_guest_actor boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'bookings' THEN
    IF TG_OP = 'INSERT' THEN
      _event_type := 'booking.created';
      _idempotency_key := 'ground_truth_hub:booking.created:' || NEW.id::text;
    ELSIF TG_OP = 'UPDATE' AND OLD.state IS DISTINCT FROM NEW.state THEN
      _event_type := 'booking.state_changed';
      _idempotency_key := 'ground_truth_hub:booking.state_changed:' || NEW.id::text || ':' || OLD.state::text || ':' || NEW.state::text || ':' || extract(epoch from COALESCE(NEW.updated_at, now()))::text;
    ELSE
      RETURN NEW;
    END IF;

    _payload := jsonb_build_object(
      'booking_id', NEW.id,
      'unit_id', NEW.unit_id,
      'guest_id', NEW.guest_id,
      'user_id', COALESCE(NEW.created_by, NEW.guest_id),
      'property_id', NEW.property_id,
      'check_in', NEW.check_in,
      'check_out', NEW.check_out,
      'state', NEW.state,
      'previous_state', CASE WHEN TG_OP = 'UPDATE' THEN OLD.state ELSE NULL END,
      'num_guests', NEW.num_guests,
      'total_price', NEW.total_price
    );
  ELSIF TG_TABLE_NAME = 'messages' THEN
    IF TG_OP <> 'INSERT' OR NEW.is_internal IS TRUE OR COALESCE(NEW.draft, false) IS TRUE THEN
      RETURN NEW;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = NEW.booking_id AND b.guest_id = NEW.sender_id
    ) INTO _is_guest_actor;

    IF NOT _is_guest_actor THEN
      RETURN NEW;
    END IF;

    _event_type := 'guest_message.received';
    _idempotency_key := 'ground_truth_hub:guest_message.received:' || NEW.id::text;
    _payload := jsonb_build_object(
      'message_id', NEW.id,
      'booking_id', NEW.booking_id,
      'sender_id', NEW.sender_id,
      'user_id', NEW.sender_id,
      'property_id', NEW.property_id,
      'channel', 'guest_portal',
      'preview', left(COALESCE(NEW.content, ''), 120),
      'has_attachment', NEW.attachment_url IS NOT NULL,
      'created_at', NEW.created_at
    );
  ELSIF TG_TABLE_NAME = 'maintenance_requests' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = NEW.booking_id AND b.guest_id = NEW.created_by
    ) INTO _is_guest_actor;

    IF NOT _is_guest_actor THEN
      RETURN NEW;
    END IF;

    _event_type := 'guest_request.created';
    _idempotency_key := 'ground_truth_hub:guest_request.created:maintenance:' || NEW.id::text;
    _payload := jsonb_build_object(
      'request_id', NEW.id,
      'request_type', 'maintenance',
      'booking_id', NEW.booking_id,
      'unit_id', NEW.unit_id,
      'user_id', NEW.created_by,
      'property_id', NEW.property_id,
      'status', NEW.status,
      'priority', NEW.priority,
      'category', NEW.category,
      'preview', left(COALESCE(NEW.description, ''), 120),
      'created_at', NEW.created_at
    );
  ELSIF TG_TABLE_NAME = 'laundry_requests' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = NEW.booking_id AND b.guest_id = NEW.created_by
    ) INTO _is_guest_actor;

    IF NOT _is_guest_actor THEN
      RETURN NEW;
    END IF;

    _event_type := 'guest_request.created';
    _idempotency_key := 'ground_truth_hub:guest_request.created:laundry:' || NEW.id::text;
    _payload := jsonb_build_object(
      'request_id', NEW.id,
      'request_type', 'laundry',
      'booking_id', NEW.booking_id,
      'unit_id', NEW.unit_id,
      'user_id', NEW.created_by,
      'property_id', NEW.property_id,
      'status', NEW.status,
      'bag_count', NEW.bag_count,
      'preview', left(COALESCE(NEW.note, ''), 120),
      'created_at', NEW.created_at
    );
  ELSE
    RETURN NEW;
  END IF;

  _internal_token := public.get_integration_secret('vanta_internal_token');
  IF _internal_token IS NULL OR length(_internal_token) < 8 THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := _edge_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'event_type', _event_type,
        'payload', _payload,
        'idempotency_key', _idempotency_key,
        'internal_token', _internal_token
      ),
      timeout_milliseconds := 1000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Vanta signal emit failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.emit_vanta_signal() TO service_role;

DROP TRIGGER IF EXISTS trg_vanta_booking_signal ON public.bookings;
CREATE TRIGGER trg_vanta_booking_signal
  AFTER INSERT OR UPDATE OF state ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.emit_vanta_signal();

DROP TRIGGER IF EXISTS trg_vanta_message_signal ON public.messages;
CREATE TRIGGER trg_vanta_message_signal
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.emit_vanta_signal();

DROP TRIGGER IF EXISTS trg_vanta_maintenance_request_signal ON public.maintenance_requests;
CREATE TRIGGER trg_vanta_maintenance_request_signal
  AFTER INSERT ON public.maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION public.emit_vanta_signal();

DROP TRIGGER IF EXISTS trg_vanta_laundry_request_signal ON public.laundry_requests;
CREATE TRIGGER trg_vanta_laundry_request_signal
  AFTER INSERT ON public.laundry_requests
  FOR EACH ROW EXECUTE FUNCTION public.emit_vanta_signal();