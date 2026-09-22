-- Final-phase seam: dual flight providers, measured paid reads, per-field provenance.
-- Nothing here changes bookings, payments, rooms, pickups or check-in.

CREATE TABLE IF NOT EXISTS public.flight_provider_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  read_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  provider text NOT NULL CHECK (provider IN ('aviationstack','aeroapi')),
  paid boolean NOT NULL DEFAULT false,
  flight_key text,
  leg_id uuid REFERENCES public.journey_legs(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  outcome text NOT NULL DEFAULT 'attempted'
    CHECK (outcome IN ('attempted','matched','empty','error','budget_blocked','disabled')),
  http_status integer,
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flight_provider_reads_day ON public.flight_provider_reads(read_day, provider, paid);
CREATE INDEX IF NOT EXISTS idx_flight_provider_reads_key ON public.flight_provider_reads(flight_key);

GRANT SELECT ON public.flight_provider_reads TO authenticated;
GRANT ALL ON public.flight_provider_reads TO service_role;
ALTER TABLE public.flight_provider_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ops staff read provider reads"
ON public.flight_provider_reads FOR SELECT TO authenticated
USING (public.has_ops_read(auth.uid()) OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'));

-- Short-lived lock so five guests on one aircraft never trigger parallel paid reads.
CREATE TABLE IF NOT EXISTS public.flight_read_locks (
  flight_key text PRIMARY KEY,
  locked_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.flight_read_locks TO service_role;
ALTER TABLE public.flight_read_locks ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only, by design.

-- Dated per-field provenance for every leg detail a provider or person supplied.
CREATE TABLE IF NOT EXISTS public.journey_leg_field_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leg_id uuid NOT NULL REFERENCES public.journey_legs(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  field_value text,
  source text NOT NULL,
  provider text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leg_provenance_leg ON public.journey_leg_field_provenance(leg_id, field_name, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_leg_provenance_booking ON public.journey_leg_field_provenance(booking_id);

GRANT SELECT ON public.journey_leg_field_provenance TO authenticated;
GRANT ALL ON public.journey_leg_field_provenance TO service_role;
ALTER TABLE public.journey_leg_field_provenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ops staff read leg provenance"
ON public.journey_leg_field_provenance FOR SELECT TO authenticated
USING (public.has_ops_read(auth.uid()) OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Guests read provenance for their own booking"
ON public.journey_leg_field_provenance FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.bookings b
  WHERE b.id = journey_leg_field_provenance.booking_id AND b.guest_id = auth.uid()
));