ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS arrived_by UUID,
  ADD COLUMN IF NOT EXISTS arrival_note TEXT;

CREATE INDEX IF NOT EXISTS bookings_arrived_at_idx
  ON public.bookings (arrived_at)
  WHERE arrived_at IS NOT NULL;