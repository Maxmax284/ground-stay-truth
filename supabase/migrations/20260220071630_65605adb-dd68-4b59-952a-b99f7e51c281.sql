
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  guest_display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(booking_id)
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Guests insert own reviews for completed bookings
CREATE POLICY "Guests can insert own reviews" ON public.reviews
  FOR INSERT WITH CHECK (
    guest_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = reviews.booking_id
        AND bookings.guest_id = auth.uid()
        AND bookings.state = 'completed'
    )
  );

-- Guests can read own reviews
CREATE POLICY "Guests can read own reviews" ON public.reviews
  FOR SELECT USING (guest_id = auth.uid());

-- Anyone can read approved reviews (public testimonials)
CREATE POLICY "Anyone can read approved reviews" ON public.reviews
  FOR SELECT USING (status = 'approved');

-- Staff can read all reviews
CREATE POLICY "Staff can read all reviews" ON public.reviews
  FOR SELECT USING (has_role(auth.uid(), 'front_desk'::app_role));

-- Admins can manage reviews
CREATE POLICY "Admins can manage reviews" ON public.reviews
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
