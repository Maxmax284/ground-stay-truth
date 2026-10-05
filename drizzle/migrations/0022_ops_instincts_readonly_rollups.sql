
-- Read-only rollup functions for the CampStay "instincts" phase.
-- All four: SECURITY DEFINER, admin/manager only, sandbox bookings excluded,
-- SELECT-only. They feed Corner Talk, Daily Brief, Weekly Friction Radar.

-- 1. Weekly/daily friction radar: funnels + comms health as counts/rates.
create or replace function public.get_friction_radar(_days int default 7)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select now() - make_interval(days => greatest(_days, 1)) as since
  ),
  portal as (
    select
      count(*) filter (where event_type = 'guest_portal_loaded') as portal_loaded,
      count(*) filter (where event_type = 'guest_booking_loaded') as booking_loaded,
      count(*) filter (where event_type = 'guest_booking_missing') as booking_missing,
      count(distinct guest_id) filter (where event_type = 'guest_booking_missing') as booking_missing_guests,
      count(*) filter (where event_type = 'guest_in_app_browser_detected') as in_app_browser,
      count(*) filter (where event_type = 'guest_network_error') as network_errors,
      count(*) filter (where event_type = 'guest_portal_load_failed') as load_failed,
      count(*) filter (where event_type = 'checkout_create_started') as checkout_started,
      count(*) filter (where event_type = 'checkout_create_success') as checkout_created,
      count(*) filter (where event_type = 'checkout_redirect_started') as checkout_redirected,
      count(*) filter (where event_type = 'checkout_left_for_provider') as checkout_reached_provider,
      count(*) filter (where event_type = 'id_upload_started') as id_upload_started,
      count(*) filter (where event_type = 'id_upload_success') as id_upload_success
    from guest_portal_activity, bounds
    where created_at >= bounds.since
      and (booking_id is null or not is_sandbox_booking(booking_id))
  ),
  email as (
    select
      count(*) filter (where status = 'sent') as sent,
      count(*) filter (where status in ('failed','bounced','error')) as failed,
      count(*) filter (where status = 'bounced') as bounced
    from email_send_log, bounds
    where created_at >= bounds.since
  ),
  suppressed as (
    select count(*) as n from suppressed_emails
  ),
  alerts as (
    select
      count(*) filter (where status = 'sent') as sent,
      count(*) filter (where status in ('suppressed','deduped','rate_limited')) as suppressed,
      count(*) filter (where status in ('failed','error')) as failed
    from admin_alert_log, bounds
    where created_at >= bounds.since and not is_test
  ),
  docs as (
    select
      count(*) as uploaded,
      count(*) filter (where review_status = 'rejected') as rejected
    from guest_documents, bounds
    where created_at >= bounds.since
      and not superseded
      and not is_sandbox_booking(booking_id)
  ),
  msgs as (
    select
      count(*) filter (where sender_id is not null) as guest_messages
    from messages, bounds
    where created_at >= bounds.since
      and not is_internal
      and external_ref is null
      and not is_sandbox_booking(booking_id)
  )
  select jsonb_build_object(
    'period_days', greatest(_days, 1),
    'portal', (select to_jsonb(portal) from portal),
    'email', (select to_jsonb(email) from email),
    'suppressed_emails_total', (select n from suppressed),
    'staff_alerts', (select to_jsonb(alerts) from alerts),
    'id_documents', (select to_jsonb(docs) from docs),
    'guest_messages', (select guest_messages from msgs)
  );
$$;

revoke all on function public.get_friction_radar(int) from public, anon;
grant execute on function public.get_friction_radar(int) to authenticated;

-- 2. Arrival risk: upcoming arrivals missing flight/ID/portal/payment, open
-- conflicts, unassigned pickups. Feeds Corner Talk + Daily Brief.
create or replace function public.get_arrival_risk(_hours int default 72)
returns table (
  booking_id uuid,
  guest_id uuid,
  check_in date,
  state booking_state,
  property_id uuid,
  missing_flight boolean,
  missing_id boolean,
  portal_never_opened boolean,
  unpaid boolean,
  pickup_unassigned boolean,
  open_conflict boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with upcoming as (
    select b.*
    from bookings b
    where b.state in ('confirmed','pending_deposit','pending_approval','checked_in')
      and b.check_in >= current_date
      and b.check_in <= (now() + make_interval(hours => greatest(_hours, 1)))::date
      and not is_sandbox_booking(b.id)
  )
  select
    u.id,
    u.guest_id,
    u.check_in,
    u.state,
    u.property_id,
    (u.flight_number is null and not exists (
      select 1 from airport_pickups ap where ap.booking_id = u.id and ap.flight_number is not null
    )) as missing_flight,
    not exists (
      select 1 from guest_documents gd where gd.booking_id = u.id and not gd.superseded
    ) as missing_id,
    not exists (
      select 1 from guest_portal_activity gpa where gpa.booking_id = u.id
    ) as portal_never_opened,
    not exists (
      select 1 from payments p where p.booking_id = u.id and p.status in ('recorded','partially_refunded')
    ) as unpaid,
    exists (
      select 1 from airport_pickups ap where ap.booking_id = u.id and ap.driver_id is null and ap.pickup_enabled
    ) as pickup_unassigned,
    exists (
      select 1 from arrival_conflicts ac where ac.booking_id = u.id and ac.resolved_at is null
    ) as open_conflict
  from upcoming u
  where has_property_access(auth.uid(), u.property_id)
  order by u.check_in;
$$;

revoke all on function public.get_arrival_risk(int) from public, anon;
grant execute on function public.get_arrival_risk(int) to authenticated;

-- 3. Reply latency: guest message -> first staff reply, per booking.
-- Aggregate only in UI; never a per-staff leaderboard.
create or replace function public.get_reply_latency(_days int default 30)
returns table (
  booking_id uuid,
  property_id uuid,
  first_guest_message_at timestamptz,
  first_staff_reply_at timestamptz,
  reply_minutes numeric,
  unanswered boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with guest_msgs as (
    select m.booking_id, min(m.created_at) as first_at
    from messages m
    join bookings b on b.id = m.booking_id
    where m.created_at >= now() - make_interval(days => greatest(_days, 1))
      and not m.is_internal
      and m.external_ref is null
      and m.sender_id = b.guest_id
      and not is_sandbox_booking(m.booking_id)
    group by m.booking_id
  ),
  staff_replies as (
    select m.booking_id, min(m.created_at) as first_reply_at
    from messages m
    join bookings b on b.id = m.booking_id
    join guest_msgs g on g.booking_id = m.booking_id
    where not m.is_internal
      and m.external_ref is null
      and m.sender_id is not null
      and m.sender_id <> b.guest_id
      and m.created_at >= g.first_at
    group by m.booking_id
  )
  select
    g.booking_id,
    b.property_id,
    g.first_at,
    s.first_reply_at,
    round(extract(epoch from (s.first_reply_at - g.first_at)) / 60.0, 1) as reply_minutes,
    (s.first_reply_at is null) as unanswered
  from guest_msgs g
  join bookings b on b.id = g.booking_id
  left join staff_replies s on s.booking_id = g.booking_id
  where has_property_access(auth.uid(), b.property_id)
  order by g.first_at desc;
$$;

revoke all on function public.get_reply_latency(int) from public, anon;
grant execute on function public.get_reply_latency(int) to authenticated;

-- 4. Booking visibility: who keeps hitting "no booking linked" and whether
-- they actually have bookings (duplicate-account signal).
create or replace function public.get_booking_visibility_issues(_days int default 30)
returns table (
  guest_id uuid,
  misses bigint,
  last_seen timestamptz,
  bookings_now bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    gpa.guest_id,
    count(*) as misses,
    max(gpa.created_at) as last_seen,
    (select count(*) from bookings b where b.guest_id = gpa.guest_id) as bookings_now
  from guest_portal_activity gpa
  where gpa.event_type = 'guest_booking_missing'
    and gpa.created_at >= now() - make_interval(days => greatest(_days, 1))
  group by gpa.guest_id
  order by misses desc;
$$;

revoke all on function public.get_booking_visibility_issues(int) from public, anon;
grant execute on function public.get_booking_visibility_issues(int) to authenticated;
