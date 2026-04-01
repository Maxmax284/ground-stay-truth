ALTER TABLE public.airport_pickups 
  ADD COLUMN IF NOT EXISTS international_flight_number text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS final_flight_confirmed boolean NOT NULL DEFAULT false;