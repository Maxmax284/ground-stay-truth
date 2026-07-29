-- Internal staff notes about a guest (keyed by directory guest key)
CREATE TABLE public.guest_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_key text NOT NULL,
  guest_id uuid,
  note text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_notes TO authenticated;
GRANT ALL ON public.guest_notes TO service_role;

ALTER TABLE public.guest_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read guest notes" ON public.guest_notes
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'front_desk_supervisor') OR public.has_role(auth.uid(),'front_desk')
  OR public.has_role(auth.uid(),'viewer')
);

CREATE POLICY "Supervisors can add guest notes" ON public.guest_notes
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() AND (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'front_desk_supervisor')
  )
);

CREATE POLICY "Authors can edit own notes" ON public.guest_notes
FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))
WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can delete guest notes" ON public.guest_notes
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_guest_notes_key ON public.guest_notes (guest_key);

CREATE TRIGGER trg_guest_notes_updated_at
BEFORE UPDATE ON public.guest_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Directory aggregate
CREATE OR REPLACE FUNCTION public.get_guest_directory()
RETURNS TABLE(
  guest_key text,
  guest_id uuid,
  full_name text,
  email text,
  phone text,
  preferred_language text,
  is_linked boolean,
  total_bookings integer,
  completed_stays integer,
  upcoming_stays integer,
  cancelled_bookings integer,
  in_house boolean,
  next_check_in date,
  last_check_out date,
  total_nights integer,
  lifetime_spend numeric,
  outstanding_balance numeric,
  first_seen timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
BEGIN
  IF NOT (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
    OR has_role(auth.uid(),'front_desk_supervisor') OR has_role(auth.uid(),'front_desk')
    OR has_role(auth.uid(),'viewer')
  ) THEN
    RAISE EXCEPTION 'staff only';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      b.*,
      CASE WHEN b.guest_id IS NOT NULL THEN 'profile:' || b.guest_id::text
           ELSE 'manual:' || lower(COALESCE(NULLIF(trim(b.manual_guest_email),''),
                                            NULLIF(trim(b.manual_guest_phone),''),
                                            NULLIF(trim(b.manual_guest_name),''),
                                            b.id::text))
      END AS gkey,
      COALESCE(p.full_name, NULLIF(trim(b.manual_guest_name),''), p.email,
               NULLIF(trim(b.manual_guest_email),''), 'Guest') AS gname,
      COALESCE(p.email, NULLIF(trim(b.manual_guest_email),'')) AS gemail,
      COALESCE(p.phone, NULLIF(trim(b.manual_guest_phone),'')) AS gphone,
      p.preferred_language AS glang
    FROM public.bookings b
    LEFT JOIN public.profiles p ON p.user_id = b.guest_id
  ),
  pay AS (
    SELECT pa.booking_id,
      SUM(CASE WHEN pa.status IN ('recorded','partially_refunded') THEN pa.amount ELSE 0 END) AS paid,
      SUM(CASE WHEN pa.status = 'pending' THEN pa.amount ELSE 0 END) AS owed
    FROM public.payments pa GROUP BY pa.booking_id
  )
  SELECT
    b.gkey,
    MAX(b.guest_id::text)::uuid,
    (array_agg(b.gname ORDER BY b.created_at DESC))[1],
    (array_agg(b.gemail ORDER BY b.created_at DESC))[1],
    (array_agg(b.gphone ORDER BY b.created_at DESC))[1],
    (array_agg(b.glang ORDER BY b.created_at DESC))[1],
    bool_or(b.guest_id IS NOT NULL),
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE b.state = 'completed')::int,
    COUNT(*) FILTER (WHERE b.state IN ('confirmed','pending_deposit','pending_approval','soft_hold','inquiry') AND b.check_in >= _today)::int,
    COUNT(*) FILTER (WHERE b.state = 'cancelled')::int,
    bool_or(b.state = 'checked_in'),
    MIN(b.check_in) FILTER (WHERE b.check_in >= _today AND b.state NOT IN ('cancelled','no_show')),
    MAX(b.check_out) FILTER (WHERE b.check_out <= _today AND b.state NOT IN ('cancelled','no_show')),
    COALESCE(SUM((b.check_out - b.check_in)) FILTER (WHERE b.state IN ('completed','checked_in')), 0)::int,
    COALESCE(SUM(pay.paid), 0)::numeric,
    COALESCE(SUM(pay.owed) FILTER (WHERE b.state NOT IN ('cancelled','no_show')), 0)::numeric,
    MIN(b.created_at)
  FROM base b
  LEFT JOIN pay ON pay.booking_id = b.id
  GROUP BY b.gkey;
END;
$$;

-- Per-guest booking timeline
CREATE OR REPLACE FUNCTION public.get_guest_bookings(_guest_key text)
RETURNS TABLE(
  booking_id uuid,
  confirmation_number text,
  unit_name text,
  state text,
  check_in date,
  check_out date,
  num_guests integer,
  total_price numeric,
  paid numeric,
  owed numeric,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
    OR has_role(auth.uid(),'front_desk_supervisor') OR has_role(auth.uid(),'front_desk')
    OR has_role(auth.uid(),'viewer')
  ) THEN
    RAISE EXCEPTION 'staff only';
  END IF;

  RETURN QUERY
  SELECT b.id, b.confirmation_number, u.name, b.state::text, b.check_in, b.check_out,
    b.num_guests, b.total_price,
    COALESCE((SELECT SUM(pa.amount) FROM public.payments pa WHERE pa.booking_id = b.id AND pa.status IN ('recorded','partially_refunded')),0)::numeric,
    COALESCE((SELECT SUM(pa.amount) FROM public.payments pa WHERE pa.booking_id = b.id AND pa.status = 'pending'),0)::numeric,
    b.created_at
  FROM public.bookings b
  LEFT JOIN public.units u ON u.id = b.unit_id
  WHERE (
    CASE WHEN b.guest_id IS NOT NULL THEN 'profile:' || b.guest_id::text
         ELSE 'manual:' || lower(COALESCE(NULLIF(trim(b.manual_guest_email),''),
                                          NULLIF(trim(b.manual_guest_phone),''),
                                          NULLIF(trim(b.manual_guest_name),''),
                                          b.id::text))
    END
  ) = _guest_key
  ORDER BY b.check_in DESC;
END;
$$;

-- Admin-only duplicate merge
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

  PERFORM public.log_staff_audit_event(
    'guest.records_merged','warning',_actor,_target_id,
    'Merged duplicate guest records',
    jsonb_build_object('source_key',_source_key,'target_key',_target_key,'bookings_moved',_moved)
  );

  RETURN _moved;
END;
$$;