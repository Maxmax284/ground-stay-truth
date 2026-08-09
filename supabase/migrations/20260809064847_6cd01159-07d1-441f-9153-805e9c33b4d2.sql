-- ============================================================
-- Phase 1: stay segments + modification history
-- ============================================================

-- Sandbox property flag (Phase 4 foundation)
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;

-- ---------- stay_modifications ----------
CREATE TABLE public.stay_modifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'other',
  reason_code text NOT NULL DEFAULT 'other',
  notes text,
  before_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  pricing_before numeric NOT NULL DEFAULT 0,
  pricing_after numeric NOT NULL DEFAULT 0,
  calculated_amount numeric NOT NULL DEFAULT 0,
  waived_amount numeric NOT NULL DEFAULT 0,
  final_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'committed',
  payment_status text NOT NULL DEFAULT 'not_required',
  hold_expires_at timestamptz,
  actor_id uuid,
  actor_email text,
  actor_role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stay_modifications_kind_check CHECK (kind IN ('extend','shorten','room_change','upgrade','downgrade','relocation','combined','other')),
  CONSTRAINT stay_modifications_status_check CHECK (status IN ('draft','pending_payment','committed','cancelled','expired')),
  CONSTRAINT stay_modifications_payment_status_check CHECK (payment_status IN ('not_required','waived','pending','paid','failed','credit_due','refunded'))
);

GRANT SELECT, INSERT, UPDATE ON public.stay_modifications TO authenticated;
GRANT ALL ON public.stay_modifications TO service_role;
ALTER TABLE public.stay_modifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ops staff can view stay modifications"
  ON public.stay_modifications FOR SELECT TO authenticated
  USING (public.has_ops_read(auth.uid()));

CREATE POLICY "Guests can view their own stay modifications"
  ON public.stay_modifications FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = stay_modifications.booking_id AND b.guest_id = auth.uid()
  ));

CREATE POLICY "Ops staff can create stay modifications"
  ON public.stay_modifications FOR INSERT TO authenticated
  WITH CHECK (public.has_ops_write(auth.uid()));

CREATE POLICY "Ops staff can update stay modifications"
  ON public.stay_modifications FOR UPDATE TO authenticated
  USING (public.has_ops_write(auth.uid()))
  WITH CHECK (public.has_ops_write(auth.uid()));

CREATE INDEX idx_stay_modifications_booking ON public.stay_modifications(booking_id, created_at DESC);
CREATE INDEX idx_stay_modifications_pending ON public.stay_modifications(status, hold_expires_at) WHERE status = 'pending_payment';

CREATE TRIGGER update_stay_modifications_updated_at
  BEFORE UPDATE ON public.stay_modifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- booking_segments ----------
CREATE TABLE public.booking_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id),
  property_id uuid REFERENCES public.properties(id),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'active',
  modification_id uuid REFERENCES public.stay_modifications(id) ON DELETE SET NULL,
  hold_expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_segments_status_check CHECK (status IN ('active','pending','released')),
  CONSTRAINT booking_segments_range_check CHECK (ends_on > starts_on)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_segments TO authenticated;
GRANT ALL ON public.booking_segments TO service_role;
ALTER TABLE public.booking_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ops staff can view booking segments"
  ON public.booking_segments FOR SELECT TO authenticated
  USING (public.has_ops_read(auth.uid()));

CREATE POLICY "Guests can view their own booking segments"
  ON public.booking_segments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_segments.booking_id AND b.guest_id = auth.uid()
  ));

CREATE POLICY "Ops staff can insert booking segments"
  ON public.booking_segments FOR INSERT TO authenticated
  WITH CHECK (public.has_ops_write(auth.uid()));

CREATE POLICY "Ops staff can update booking segments"
  ON public.booking_segments FOR UPDATE TO authenticated
  USING (public.has_ops_write(auth.uid()))
  WITH CHECK (public.has_ops_write(auth.uid()));

CREATE POLICY "Ops staff can delete booking segments"
  ON public.booking_segments FOR DELETE TO authenticated
  USING (public.has_ops_write(auth.uid()));

CREATE INDEX idx_booking_segments_booking ON public.booking_segments(booking_id, starts_on);
CREATE INDEX idx_booking_segments_unit_range ON public.booking_segments(unit_id, starts_on, ends_on) WHERE status IN ('active','pending');

CREATE TRIGGER update_booking_segments_updated_at
  BEFORE UPDATE ON public.booking_segments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Backfill one segment per existing booking ----------
-- Runs BEFORE the overlap trigger is installed: some historical stays overlap
-- old maintenance blocks and must be preserved exactly as they are.
INSERT INTO public.booking_segments (booking_id, unit_id, property_id, starts_on, ends_on, status, created_by, created_at)
SELECT b.id, b.unit_id, b.property_id, b.check_in, b.check_out, 'active', b.created_by, b.created_at
FROM public.bookings b
WHERE b.unit_id IS NOT NULL
  AND b.check_out > b.check_in
  AND NOT EXISTS (SELECT 1 FROM public.booking_segments s WHERE s.booking_id = b.id);

-- ---------- booking_adjustments link ----------
ALTER TABLE public.booking_adjustments
  ADD COLUMN IF NOT EXISTS modification_id uuid REFERENCES public.stay_modifications(id) ON DELETE SET NULL;

-- ---------- Segment-level overlap protection ----------
CREATE OR REPLACE FUNCTION public.check_segment_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('active','pending') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.booking_segments s
    JOIN public.bookings b ON b.id = s.booking_id
    WHERE s.unit_id = NEW.unit_id
      AND s.id <> NEW.id
      AND s.booking_id <> NEW.booking_id
      AND s.status IN ('active','pending')
      AND b.state IN ('inquiry','soft_hold','pending_approval','pending_deposit','confirmed','checked_in')
      AND s.starts_on < NEW.ends_on
      AND s.ends_on > NEW.starts_on
  ) THEN
    RAISE EXCEPTION 'This room is already occupied for part of that date range'
      USING ERRCODE = '23P01';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.maintenance_blocks mb
    WHERE mb.unit_id = NEW.unit_id
      AND mb.start_date < NEW.ends_on
      AND mb.end_date > NEW.starts_on
  ) THEN
    RAISE EXCEPTION 'This room is blocked for maintenance during that date range'
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_segment_overlap
  BEFORE INSERT OR UPDATE ON public.booking_segments
  FOR EACH ROW EXECUTE FUNCTION public.check_segment_overlap();

-- ---------- Booking-level overlap becomes segment-aware ----------
-- Bookings that already have segments are validated at the segment level
-- (a mid-stay room move makes whole-range booking comparison wrong).
CREATE OR REPLACE FUNCTION public.check_booking_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.state IN ('inquiry', 'soft_hold', 'pending_approval', 'pending_deposit', 'confirmed', 'checked_in') THEN
    IF EXISTS (SELECT 1 FROM public.booking_segments WHERE booking_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.bookings
      WHERE unit_id = NEW.unit_id
        AND id != NEW.id
        AND state IN ('inquiry', 'soft_hold', 'pending_approval', 'pending_deposit', 'confirmed', 'checked_in')
        AND check_in < NEW.check_out
        AND check_out > NEW.check_in
    ) THEN
      RAISE EXCEPTION 'Booking dates overlap with an existing booking for this unit'
        USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- Keep bookings and segments in sync ----------
CREATE OR REPLACE FUNCTION public.booking_create_initial_segment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.unit_id IS NOT NULL AND NEW.check_out > NEW.check_in THEN
    INSERT INTO public.booking_segments (booking_id, unit_id, property_id, starts_on, ends_on, status, created_by)
    VALUES (NEW.id, NEW.unit_id, NEW.property_id, NEW.check_in, NEW.check_out, 'active', NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_booking_create_initial_segment
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.booking_create_initial_segment();

-- Legacy edit paths (booking form) change bookings.unit_id / dates directly.
-- When the stay has exactly one active segment, mirror the change onto it.
-- Multi-segment stays are owned by the Modify Stay flow and are left alone.
CREATE OR REPLACE FUNCTION public.booking_sync_single_segment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  seg_count integer;
  seg_id uuid;
BEGIN
  IF NEW.unit_id IS DISTINCT FROM OLD.unit_id
     OR NEW.check_in IS DISTINCT FROM OLD.check_in
     OR NEW.check_out IS DISTINCT FROM OLD.check_out THEN

    SELECT count(*) INTO seg_count
    FROM public.booking_segments
    WHERE booking_id = NEW.id AND status IN ('active','pending');

    IF seg_count = 0 THEN
      IF NEW.unit_id IS NOT NULL AND NEW.check_out > NEW.check_in THEN
        INSERT INTO public.booking_segments (booking_id, unit_id, property_id, starts_on, ends_on, status, created_by)
        VALUES (NEW.id, NEW.unit_id, NEW.property_id, NEW.check_in, NEW.check_out, 'active', NEW.created_by);
      END IF;
    ELSIF seg_count = 1 THEN
      SELECT id INTO seg_id
      FROM public.booking_segments
      WHERE booking_id = NEW.id AND status IN ('active','pending')
      LIMIT 1;

      UPDATE public.booking_segments
      SET unit_id = NEW.unit_id,
          property_id = NEW.property_id,
          starts_on = NEW.check_in,
          ends_on = NEW.check_out
      WHERE id = seg_id
        AND (unit_id IS DISTINCT FROM NEW.unit_id
             OR starts_on IS DISTINCT FROM NEW.check_in
             OR ends_on IS DISTINCT FROM NEW.check_out);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_booking_sync_single_segment
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.booking_sync_single_segment();

-- Reverse direction: used by the Modify Stay flow after it rewrites segments.
CREATE OR REPLACE FUNCTION public.sync_booking_from_segments(_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  min_in date;
  max_out date;
  current_unit uuid;
BEGIN
  SELECT min(starts_on), max(ends_on) INTO min_in, max_out
  FROM public.booking_segments
  WHERE booking_id = _booking_id AND status IN ('active','pending');

  IF min_in IS NULL THEN
    RETURN;
  END IF;

  -- "Current" room: the segment covering today, else the earliest upcoming one.
  SELECT unit_id INTO current_unit
  FROM public.booking_segments
  WHERE booking_id = _booking_id AND status IN ('active','pending')
  ORDER BY
    CASE WHEN (now() AT TIME ZONE 'Asia/Bangkok')::date >= starts_on
              AND (now() AT TIME ZONE 'Asia/Bangkok')::date < ends_on THEN 0 ELSE 1 END,
    starts_on
  LIMIT 1;

  UPDATE public.bookings
  SET check_in = min_in,
      check_out = max_out,
      unit_id = COALESCE(current_unit, unit_id)
  WHERE id = _booking_id
    AND (check_in IS DISTINCT FROM min_in
         OR check_out IS DISTINCT FROM max_out
         OR unit_id IS DISTINCT FROM COALESCE(current_unit, unit_id));
END;
$$;

REVOKE ALL ON FUNCTION public.sync_booking_from_segments(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_booking_from_segments(uuid) TO service_role;