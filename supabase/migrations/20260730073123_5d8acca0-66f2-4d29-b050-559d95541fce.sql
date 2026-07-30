CREATE TABLE IF NOT EXISTS public.admin_alert_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid,
  event_type text not null,
  category text,
  severity text,
  channel text not null default 'email',
  recipient_user_id uuid,
  recipient_email text,
  status text not null default 'queued',
  failure_reason text,
  retry_count int not null default 0,
  booking_id uuid,
  guest_id uuid,
  triggered_by text,
  template_key text,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_admin_alert_log_created ON public.admin_alert_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_alert_log_recipient_event ON public.admin_alert_log (recipient_user_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_alert_log_status ON public.admin_alert_log (status, created_at DESC);

GRANT SELECT ON public.admin_alert_log TO authenticated;
GRANT ALL ON public.admin_alert_log TO service_role;

ALTER TABLE public.admin_alert_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view admin alert log" ON public.admin_alert_log;
CREATE POLICY "Staff can view admin alert log"
ON public.admin_alert_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));