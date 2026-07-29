CREATE OR REPLACE FUNCTION public.get_guest_directory()
 RETURNS TABLE(guest_key text, guest_id uuid, full_name text, email text, phone text, preferred_language text, is_linked boolean, total_bookings integer, completed_stays integer, upcoming_stays integer, cancelled_bookings integer, in_house boolean, next_check_in date, last_check_out date, total_nights integer, lifetime_spend numeric, outstanding_balance numeric, first_seen timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ),
  agg AS (
    SELECT
      b.gkey AS k,
      MAX(b.guest_id::text)::uuid AS gid,
      (array_agg(b.gname ORDER BY b.created_at DESC))[1] AS nm,
      (array_agg(b.gemail ORDER BY b.created_at DESC))[1] AS em,
      (array_agg(b.gphone ORDER BY b.created_at DESC))[1] AS ph,
      (array_agg(b.glang ORDER BY b.created_at DESC))[1] AS lg,
      bool_or(b.guest_id IS NOT NULL) AS linked,
      COUNT(*)::int AS tot,
      COUNT(*) FILTER (WHERE b.state = 'completed')::int AS comp,
      COUNT(*) FILTER (WHERE b.state IN ('confirmed','pending_deposit','pending_approval','soft_hold','inquiry') AND b.check_in >= _today)::int AS upc,
      COUNT(*) FILTER (WHERE b.state = 'cancelled')::int AS canc,
      bool_or(b.state = 'checked_in') AS inh,
      MIN(b.check_in) FILTER (WHERE b.check_in >= _today AND b.state NOT IN ('cancelled','no_show')) AS nci,
      MAX(b.check_out) FILTER (WHERE b.check_out <= _today AND b.state NOT IN ('cancelled','no_show')) AS lco,
      COALESCE(SUM((b.check_out - b.check_in)) FILTER (WHERE b.state IN ('completed','checked_in')), 0)::int AS nights,
      COALESCE(SUM(pay.paid), 0)::numeric AS spend,
      COALESCE(SUM(pay.owed) FILTER (WHERE b.state NOT IN ('cancelled','no_show')), 0)::numeric AS owed,
      MIN(b.created_at) AS first_seen
    FROM base b
    LEFT JOIN pay ON pay.booking_id = b.id
    GROUP BY b.gkey
  )
  SELECT a.k, a.gid, a.nm, a.em, a.ph, a.lg, a.linked, a.tot, a.comp, a.upc, a.canc,
         a.inh, a.nci, a.lco, a.nights, a.spend, a.owed, a.first_seen
  FROM agg a

  UNION ALL

  -- Registered guest accounts with no bookings yet
  SELECT
    'profile:' || p.user_id::text,
    p.user_id,
    COALESCE(NULLIF(trim(p.full_name),''), p.email, 'Guest'),
    p.email,
    p.phone,
    p.preferred_language,
    true,
    0, 0, 0, 0,
    false,
    NULL::date, NULL::date,
    0, 0::numeric, 0::numeric,
    p.created_at
  FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.guest_id = p.user_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.user_id
        AND ur.role IN ('admin','manager','front_desk_supervisor','front_desk','maintenance','viewer')
    );
END;
$function$;