CREATE TABLE public.airport_traffic (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_iata text NOT NULL,
  airline_name text,
  departure_iata text,
  arrival_iata text,
  departure_airport text,
  arrival_airport text,
  scheduled_departure timestamptz,
  scheduled_arrival timestamptz,
  estimated_arrival timestamptz,
  actual_arrival timestamptz,
  flight_status text NOT NULL DEFAULT 'unknown',
  delay_minutes integer DEFAULT 0,
  terminal text,
  gate text,
  flight_date date NOT NULL DEFAULT CURRENT_DATE,
  direction text NOT NULL,
  airport_iata text NOT NULL,
  linked_pickup_id uuid REFERENCES public.airport_pickups(id) ON DELETE SET NULL,
  raw_response jsonb,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flight_iata, flight_date, airport_iata, direction)
);

ALTER TABLE public.airport_traffic ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read airport traffic"
  ON public.airport_traffic FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'front_desk'::app_role));

CREATE POLICY "Admins can manage airport traffic"
  ON public.airport_traffic FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can read airport traffic"
  ON public.airport_traffic FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role));

CREATE INDEX idx_airport_traffic_date_airport ON public.airport_traffic (flight_date, airport_iata);
CREATE INDEX idx_airport_traffic_linked_pickup ON public.airport_traffic (linked_pickup_id) WHERE linked_pickup_id IS NOT NULL;

CREATE TRIGGER update_airport_traffic_updated_at
  BEFORE UPDATE ON public.airport_traffic
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();