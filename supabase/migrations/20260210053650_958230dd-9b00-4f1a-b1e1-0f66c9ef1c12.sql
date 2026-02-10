
-- Table to track early check-in escalation requests
CREATE TABLE public.early_checkin_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reason TEXT NOT NULL,
  response_note TEXT,
  buffer_violation_hours NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.early_checkin_requests ENABLE ROW LEVEL SECURITY;

-- Staff can read early check-in requests
CREATE POLICY "Staff can read early checkin requests"
  ON public.early_checkin_requests
  FOR SELECT
  USING (has_role(auth.uid(), 'front_desk'::app_role));

-- Staff can create early check-in requests
CREATE POLICY "Staff can create early checkin requests"
  ON public.early_checkin_requests
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'front_desk'::app_role));

-- Managers can update (approve/deny) early check-in requests
CREATE POLICY "Managers can update early checkin requests"
  ON public.early_checkin_requests
  FOR UPDATE
  USING (has_role(auth.uid(), 'manager'::app_role));

-- Admins can manage all early check-in requests
CREATE POLICY "Admins can manage early checkin requests"
  ON public.early_checkin_requests
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
