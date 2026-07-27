CREATE TABLE public.guest_portal_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  guest_id uuid,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_status text NOT NULL DEFAULT 'info',
  severity text NOT NULL DEFAULT 'info',
  source text NOT NULL DEFAULT 'guest_portal',
  route text,
  component text,
  action text,
  message text,
  error_code text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_agent text,
  device_type text,
  browser_name text,
  os_name text,
  is_in_app_browser boolean NOT NULL DEFAULT false,
  session_id text,
  correlation_id text
);

GRANT SELECT, INSERT ON public.guest_portal_activity TO authenticated;
GRANT ALL ON public.guest_portal_activity TO service_role;

ALTER TABLE public.guest_portal_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guests can log their own portal activity"
ON public.guest_portal_activity FOR INSERT TO authenticated
WITH CHECK (guest_id IS NULL OR guest_id = auth.uid());

CREATE POLICY "Staff can read portal activity"
ON public.guest_portal_activity FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins can delete portal activity"
ON public.guest_portal_activity FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_gpa_created_at ON public.guest_portal_activity (created_at DESC);
CREATE INDEX idx_gpa_booking ON public.guest_portal_activity (booking_id, created_at DESC);
CREATE INDEX idx_gpa_event ON public.guest_portal_activity (event_type, created_at DESC);