-- Stage 3: guest progress is a separate track from aircraft status.
-- Aircraft telemetry may never set these; only a named human action can.
ALTER TABLE public.airport_pickups
  ADD COLUMN IF NOT EXISTS guest_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS guest_ready_by uuid,
  ADD COLUMN IF NOT EXISTS collected_at timestamptz,
  ADD COLUMN IF NOT EXISTS collected_by uuid;

COMMENT ON COLUMN public.airport_pickups.guest_ready_at IS 'Guest (or staff on their behalf) explicitly said they are out and ready. Never set from flight data.';
COMMENT ON COLUMN public.airport_pickups.collected_at IS 'Staff/driver confirmed the guest is physically with the driver. Never set from flight data.';