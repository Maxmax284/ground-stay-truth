-- Driver access: expiring, single-pickup, read-only links.
-- Drivers have no platform account. A link carries one pickup, nothing else:
-- no money, no booking reference, no other guests. One safe action: Collected.
CREATE TABLE public.pickup_driver_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_id uuid NOT NULL REFERENCES public.airport_pickups(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_by uuid,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  collected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pickup_driver_links_pickup ON public.pickup_driver_links(pickup_id);
CREATE INDEX idx_pickup_driver_links_booking ON public.pickup_driver_links(booking_id);

GRANT SELECT, INSERT, UPDATE ON public.pickup_driver_links TO authenticated;
GRANT ALL ON public.pickup_driver_links TO service_role;

ALTER TABLE public.pickup_driver_links ENABLE ROW LEVEL SECURITY;

-- Staff only. The driver never authenticates: the edge function reads by token
-- with the service role, so anon has no access to this table at all.
CREATE POLICY "Staff read pickup driver links"
  ON public.pickup_driver_links FOR SELECT TO authenticated
  USING (public.has_ops_read(auth.uid()) OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff create pickup driver links"
  ON public.pickup_driver_links FOR INSERT TO authenticated
  WITH CHECK (public.has_ops_write(auth.uid()) OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff revoke pickup driver links"
  ON public.pickup_driver_links FOR UPDATE TO authenticated
  USING (public.has_ops_write(auth.uid()) OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'));