-- Add unified arrival model columns to airport_pickups
ALTER TABLE public.airport_pickups
  ADD COLUMN IF NOT EXISTS arrival_type text NOT NULL DEFAULT 'flight',
  ADD COLUMN IF NOT EXISTS arrival_location_type text NOT NULL DEFAULT 'airport',
  ADD COLUMN IF NOT EXISTS arrival_location_name text,
  ADD COLUMN IF NOT EXISTS arrival_confidence text NOT NULL DEFAULT 'high',
  ADD COLUMN IF NOT EXISTS transport_intent text NOT NULL DEFAULT 'pickup',
  ADD COLUMN IF NOT EXISTS pickup_enabled boolean NOT NULL DEFAULT true;

-- Add CHECK constraints for valid values
ALTER TABLE public.airport_pickups
  ADD CONSTRAINT chk_arrival_type CHECK (arrival_type IN ('flight', 'ferry', 'bus', 'hybrid', 'unknown')),
  ADD CONSTRAINT chk_arrival_location_type CHECK (arrival_location_type IN ('airport', 'pier', 'other')),
  ADD CONSTRAINT chk_arrival_confidence CHECK (arrival_confidence IN ('high', 'flexible', 'unknown')),
  ADD CONSTRAINT chk_transport_intent CHECK (transport_intent IN ('pickup', 'self_arrival'));

-- Comment the columns for developer safety
COMMENT ON COLUMN public.airport_pickups.arrival_type IS 'How the guest arrives: flight, ferry, bus, hybrid, or unknown';
COMMENT ON COLUMN public.airport_pickups.arrival_location_type IS 'Type of final arrival point: airport, pier, or other';
COMMENT ON COLUMN public.airport_pickups.arrival_location_name IS 'Human-readable name of arrival location e.g. Samui Airport, Nathon Pier';
COMMENT ON COLUMN public.airport_pickups.arrival_confidence IS 'Precision of arrival time: high (flights), flexible (ferry/bus), unknown';
COMMENT ON COLUMN public.airport_pickups.transport_intent IS 'Guest preference: pickup or self_arrival';
COMMENT ON COLUMN public.airport_pickups.pickup_enabled IS 'Admin override: when false, no pickup occurs regardless of guest request';