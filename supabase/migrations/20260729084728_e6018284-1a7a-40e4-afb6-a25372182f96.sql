
CREATE OR REPLACE FUNCTION public.log_staff_audit_event(
  _event_type text,
  _severity text DEFAULT 'info',
  _actor_id uuid DEFAULT NULL,
  _target_user_id uuid DEFAULT NULL,
  _reason text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _id UUID;
  _email TEXT;
  _role TEXT;
  _sev TEXT;
BEGIN
  _sev := lower(COALESCE(_severity, 'info'));
  _sev := CASE
            WHEN _sev IN ('info','low','medium','high','critical') THEN _sev
            WHEN _sev IN ('warning','warn','error') THEN 'high'
            WHEN _sev = 'fatal' THEN 'critical'
            ELSE 'info'
          END;

  SELECT email INTO _email FROM public.profiles WHERE user_id = _actor_id;
  SELECT role::text INTO _role FROM public.user_roles WHERE user_id = _actor_id LIMIT 1;

  INSERT INTO public.staff_audit_events
    (event_type, severity, actor_id, actor_email, actor_role, target_user_id, reason, metadata)
  VALUES
    (_event_type, _sev, _actor_id, _email, _role, _target_user_id, _reason,
     COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_guest_records(_source_key text, _target_key text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _target_id uuid;
  _moved int := 0;
BEGIN
  IF NOT has_role(_actor,'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF _source_key IS NULL OR _target_key IS NULL OR _source_key = _target_key THEN
    RAISE EXCEPTION 'invalid merge keys';
  END IF;
  IF _target_key NOT LIKE 'profile:%' THEN
    RAISE EXCEPTION 'merge target must be a registered guest account';
  END IF;

  _target_id := replace(_target_key, 'profile:', '')::uuid;

  WITH src AS (
    SELECT b.id FROM public.bookings b
    WHERE (
      CASE WHEN b.guest_id IS NOT NULL THEN 'profile:' || b.guest_id::text
           ELSE 'manual:' || lower(COALESCE(NULLIF(trim(b.manual_guest_email),''),
                                            NULLIF(trim(b.manual_guest_phone),''),
                                            NULLIF(trim(b.manual_guest_name),''),
                                            b.id::text))
      END
    ) = _source_key
  )
  UPDATE public.bookings b
  SET guest_id = _target_id, updated_at = now()
  FROM src WHERE b.id = src.id;

  GET DIAGNOSTICS _moved = ROW_COUNT;

  UPDATE public.guest_notes
  SET guest_key = _target_key, guest_id = _target_id
  WHERE guest_key = _source_key;

  BEGIN
    PERFORM public.log_staff_audit_event(
      'guest.records_merged','high',_actor,_target_id,
      'Merged duplicate guest records',
      jsonb_build_object('source_key',_source_key,'target_key',_target_key,'bookings_moved',_moved)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'merge audit log failed: %', SQLERRM;
  END;

  RETURN _moved;
END;
$$;
