-- Stage 1: Guest Arrival Intelligence read-model foundations.
-- Behind-the-scenes only: legs, shared flight facts, provenance and conflicts.
-- Nothing here changes bookings, money, rooms or pickup status.

-- ── Shared flight facts (one row per aircraft/flight/date, many guests) ──
CREATE TABLE public.flight_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_key text NOT NULL,
  flight_date date NOT NULL,
  marketed_flight_number text,
  operating_flight_number text,
  marketed_carrier text,
  operating_carrier text,
  airline_name text,
  departure_iata text,
  arrival_iata text,
  departure_airport text,
  arrival_airport text,
  departure_timezone text,
  arrival_timezone text,
  scheduled_departure timestamptz,
  estimated_departure timestamptz,
  actual_departure timestamptz,
  scheduled_arrival timestamptz,
  estimated_arrival timestamptz,
  actual_arrival timestamptz,
  flight_status text NOT NULL DEFAULT 'unknown',
  delay_minutes integer NOT NULL DEFAULT 0,
  terminal text,
  gate text,
  provider text NOT NULL DEFAULT 'aviationstack',
  raw_response jsonb,
  lookup_count integer NOT NULL DEFAULT 0,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flight_facts_key_unique UNIQUE (flight_key)
);

CREATE INDEX idx_flight_facts_date ON public.flight_facts (flight_date);
CREATE INDEX idx_flight_facts_arrival ON public.flight_facts (arrival_iata, flight_date);

GRANT SELECT ON public.flight_facts TO authenticated;
GRANT ALL ON public.flight_facts TO service_role;

ALTER TABLE public.flight_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read flight facts"
ON public.flight_facts FOR SELECT TO authenticated
USING (public.has_ops_read(auth.uid()) OR public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Admins manage flight facts"
ON public.flight_facts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ── Journey legs (ordered, multi-leg, provenance-carrying) ──
CREATE TABLE public.journey_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  pickup_id uuid REFERENCES public.airport_pickups(id) ON DELETE SET NULL,
  flight_fact_id uuid REFERENCES public.flight_facts(id) ON DELETE SET NULL,
  leg_order integer NOT NULL DEFAULT 1,
  leg_type text NOT NULL DEFAULT 'flight',
  marketed_flight_number text,
  operating_flight_number text,
  marketed_carrier text,
  operating_carrier text,
  from_code text,
  to_code text,
  from_name text,
  to_name text,
  departure_timezone text,
  arrival_timezone text,
  scheduled_departure timestamptz,
  scheduled_arrival timestamptz,
  leg_status text NOT NULL DEFAULT 'unknown',
  is_final_leg boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'guest_stated',
  confidence text NOT NULL DEFAULT 'unknown',
  recorded_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journey_legs_type_check CHECK (leg_type IN ('flight','ferry','bus','road','other')),
  CONSTRAINT journey_legs_source_check CHECK (source IN ('guest_stated','staff_entered','provider','guest_reported','evidence_extracted','inferred')),
  CONSTRAINT journey_legs_confidence_check CHECK (confidence IN ('high','flexible','unknown')),
  CONSTRAINT journey_legs_order_unique UNIQUE (booking_id, leg_order)
);

CREATE INDEX idx_journey_legs_booking ON public.journey_legs (booking_id, leg_order);
CREATE INDEX idx_journey_legs_pickup ON public.journey_legs (pickup_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journey_legs TO authenticated;
GRANT ALL ON public.journey_legs TO service_role;

ALTER TABLE public.journey_legs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guests read own journey legs"
ON public.journey_legs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = journey_legs.booking_id AND b.guest_id = auth.uid()));

CREATE POLICY "Staff read journey legs"
ON public.journey_legs FOR SELECT TO authenticated
USING (public.has_ops_read(auth.uid()) OR public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Staff write journey legs"
ON public.journey_legs FOR INSERT TO authenticated
WITH CHECK (public.has_ops_write(auth.uid()) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff update journey legs"
ON public.journey_legs FOR UPDATE TO authenticated
USING (public.has_ops_write(auth.uid()) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete journey legs"
ON public.journey_legs FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ── Conflicts: two competing facts, waiting for a human ──
CREATE TABLE public.arrival_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  leg_id uuid REFERENCES public.journey_legs(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  existing_value text,
  existing_source text,
  incoming_value text,
  incoming_source text,
  severity text NOT NULL DEFAULT 'warning',
  status text NOT NULL DEFAULT 'open',
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution text,
  note text,
  CONSTRAINT arrival_conflicts_status_check CHECK (status IN ('open','resolved','dismissed')),
  CONSTRAINT arrival_conflicts_severity_check CHECK (severity IN ('info','warning','critical')),
  CONSTRAINT arrival_conflicts_resolution_check CHECK (resolution IS NULL OR resolution IN ('kept_existing','accepted_incoming','manual_entry','not_applicable'))
);

CREATE INDEX idx_arrival_conflicts_booking ON public.arrival_conflicts (booking_id, status);

GRANT SELECT, INSERT, UPDATE ON public.arrival_conflicts TO authenticated;
GRANT ALL ON public.arrival_conflicts TO service_role;

ALTER TABLE public.arrival_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read arrival conflicts"
ON public.arrival_conflicts FOR SELECT TO authenticated
USING (public.has_ops_read(auth.uid()) OR public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Staff insert arrival conflicts"
ON public.arrival_conflicts FOR INSERT TO authenticated
WITH CHECK (public.has_ops_write(auth.uid()) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff resolve arrival conflicts"
ON public.arrival_conflicts FOR UPDATE TO authenticated
USING (public.has_ops_write(auth.uid()) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- keep updated_at fresh
CREATE TRIGGER trg_flight_facts_updated_at BEFORE UPDATE ON public.flight_facts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_journey_legs_updated_at BEFORE UPDATE ON public.journey_legs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();