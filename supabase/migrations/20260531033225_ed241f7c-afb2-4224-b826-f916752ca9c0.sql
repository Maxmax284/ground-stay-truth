
-- ── webhook_health: one row per provider, snapshot of latest webhook activity ──
CREATE TABLE public.webhook_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  last_received_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure_reason text,
  last_event_id text,
  status text NOT NULL DEFAULT 'unknown',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.webhook_health TO authenticated;
GRANT ALL ON public.webhook_health TO service_role;
ALTER TABLE public.webhook_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read webhook health"
  ON public.webhook_health FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ── payment_links: signed, single-purpose deposit payment tokens ──
CREATE TABLE public.payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'thb',
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  used_session_id text,
  revoked_at timestamptz,
  revoked_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_payment_links_booking ON public.payment_links(booking_id, created_at DESC);
CREATE INDEX idx_payment_links_active ON public.payment_links(booking_id) WHERE used_at IS NULL AND revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.payment_links TO authenticated;
GRANT ALL ON public.payment_links TO service_role;
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

-- Staff/admins manage; guests never read directly (consumed via edge function with service role)
CREATE POLICY "Admins manage payment links"
  ON public.payment_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers manage payment links"
  ON public.payment_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Front desk read+create payment links"
  ON public.payment_links FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'front_desk'::app_role));

CREATE POLICY "Front desk insert payment links"
  ON public.payment_links FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'front_desk'::app_role) AND created_by = auth.uid());

-- ── payment_link_events: audit trail (operational, not security) ──
CREATE TABLE public.payment_link_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_link_id uuid REFERENCES public.payment_links(id) ON DELETE SET NULL,
  booking_id uuid,
  event_type text NOT NULL, -- generated|regenerated|copied|opened|checkout_started|expired_attempt|invalid_attempt|already_paid_attempt|revoked
  actor_id uuid,
  actor_role text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_link_events_link ON public.payment_link_events(payment_link_id, created_at DESC);
CREATE INDEX idx_payment_link_events_booking ON public.payment_link_events(booking_id, created_at DESC);

GRANT INSERT ON public.payment_link_events TO authenticated;
GRANT SELECT ON public.payment_link_events TO authenticated;
GRANT ALL ON public.payment_link_events TO service_role;
ALTER TABLE public.payment_link_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all payment link events"
  ON public.payment_link_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers read payment link events"
  ON public.payment_link_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Front desk read payment link events"
  ON public.payment_link_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'front_desk'::app_role));

CREATE POLICY "Staff insert payment link events"
  ON public.payment_link_events FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'front_desk'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Seed webhook_health for stripe so admin UI has something to show pre-launch
INSERT INTO public.webhook_health (provider, status)
VALUES ('stripe', 'awaiting_first_event')
ON CONFLICT (provider) DO NOTHING;
