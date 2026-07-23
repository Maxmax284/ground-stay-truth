
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS confirmation_number text,
  ADD COLUMN IF NOT EXISTS confirmation_first_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_regeneration_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_confirmation_number_key
  ON public.bookings (confirmation_number)
  WHERE confirmation_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.booking_confirmation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  confirmation_number text,
  mode text NOT NULL DEFAULT 'confirmed',
  language text NOT NULL DEFAULT 'en',
  actor_id uuid,
  actor_role text,
  channel text NOT NULL DEFAULT 'download',
  path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_confirmation_log_booking_idx
  ON public.booking_confirmation_log (booking_id, created_at DESC);

GRANT SELECT, INSERT ON public.booking_confirmation_log TO authenticated;
GRANT ALL ON public.booking_confirmation_log TO service_role;

ALTER TABLE public.booking_confirmation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view confirmation log"
  ON public.booking_confirmation_log
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'front_desk_supervisor')
    OR public.has_role(auth.uid(), 'front_desk')
  );

CREATE POLICY "Guests can view own confirmation log"
  ON public.booking_confirmation_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_confirmation_log.booking_id
        AND b.guest_id = auth.uid()
    )
  );
