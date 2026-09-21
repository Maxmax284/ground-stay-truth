-- Stage 2: guest travel evidence (screenshots / confirmations).
-- Evidence is kept only as long as it is useful; the applied facts live on the
-- legs, with provenance. Booking references are stored MASKED only.
CREATE TABLE public.journey_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploader_role text NOT NULL DEFAULT 'guest' CHECK (uploader_role IN ('guest','staff')),
  kind text NOT NULL DEFAULT 'screenshot' CHECK (kind IN ('screenshot','confirmation','manual','other')),
  storage_path text,
  mime_type text,
  file_size integer,
  extraction_status text NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending','extracted','no_data','failed')),
  extracted_payload jsonb,
  booking_reference_masked text,
  applied_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  conflicts_created integer NOT NULL DEFAULT 0,
  legs_created integer NOT NULL DEFAULT 0,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_journey_evidence_booking ON public.journey_evidence(booking_id, created_at DESC);

GRANT SELECT, INSERT ON public.journey_evidence TO authenticated;
GRANT ALL ON public.journey_evidence TO service_role;

ALTER TABLE public.journey_evidence ENABLE ROW LEVEL SECURITY;

-- Guests: strictly their own booking, insert and read.
CREATE POLICY "Guests read own travel evidence"
ON public.journey_evidence FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = journey_evidence.booking_id AND b.guest_id = auth.uid()));

CREATE POLICY "Guests upload own travel evidence"
ON public.journey_evidence FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND uploader_role = 'guest'
  AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = journey_evidence.booking_id AND b.guest_id = auth.uid())
);

-- Staff: read for operations, insert when they upload on a guest's behalf.
CREATE POLICY "Staff read travel evidence"
ON public.journey_evidence FOR SELECT TO authenticated
USING (public.has_ops_read(auth.uid()) OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff upload travel evidence"
ON public.journey_evidence FOR INSERT TO authenticated
WITH CHECK (
  uploader_role = 'staff'
  AND uploaded_by = auth.uid()
  AND (public.has_ops_write(auth.uid()) OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Admins manage travel evidence"
ON public.journey_evidence FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Guests own their journey legs for intake: they may add and correct their own
-- travel details. Operational fields (pickup, driver, fee, status) stay staff-only
-- on their own tables, untouched by this.
CREATE POLICY "Guests add own journey legs"
ON public.journey_legs FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = journey_legs.booking_id AND b.guest_id = auth.uid())
  AND source IN ('guest_stated','guest_reported')
);

CREATE POLICY "Guests update own guest-stated legs"
ON public.journey_legs FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = journey_legs.booking_id AND b.guest_id = auth.uid())
  AND source IN ('guest_stated','guest_reported','evidence_extracted','inferred')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = journey_legs.booking_id AND b.guest_id = auth.uid())
  AND source IN ('guest_stated','guest_reported','evidence_extracted')
);

CREATE POLICY "Guests delete own guest-stated legs"
ON public.journey_legs FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = journey_legs.booking_id AND b.guest_id = auth.uid())
  AND source IN ('guest_stated','guest_reported','evidence_extracted','inferred')
);