
-- bookings: staff can read
CREATE POLICY "Staff can read all bookings"
ON public.bookings FOR SELECT
USING (public.has_role(auth.uid(), 'front_desk'::app_role));

-- bookings: staff can update
CREATE POLICY "Staff can update bookings"
ON public.bookings FOR UPDATE
USING (public.has_role(auth.uid(), 'front_desk'::app_role));

-- booking_state_log: staff can read
CREATE POLICY "Staff can read booking state logs"
ON public.booking_state_log FOR SELECT
USING (public.has_role(auth.uid(), 'front_desk'::app_role));

-- booking_state_log: staff can insert
CREATE POLICY "Staff can insert booking state logs"
ON public.booking_state_log FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'front_desk'::app_role));

-- payments: supervisor+ can read
CREATE POLICY "Supervisors can read payments"
ON public.payments FOR SELECT
USING (public.has_role(auth.uid(), 'front_desk_supervisor'::app_role));

-- payments: supervisor+ can insert
CREATE POLICY "Supervisors can insert payments"
ON public.payments FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'front_desk_supervisor'::app_role));

-- messages: staff can read all messages
CREATE POLICY "Staff can read all messages"
ON public.messages FOR SELECT
USING (public.has_role(auth.uid(), 'front_desk'::app_role));

-- messages: staff can send messages
CREATE POLICY "Staff can send messages"
ON public.messages FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'front_desk'::app_role));

-- profiles: staff can read all profiles
CREATE POLICY "Staff can read all profiles"
ON public.profiles FOR SELECT
USING (public.has_role(auth.uid(), 'front_desk'::app_role));

-- pricing_rules: manager+ can read
CREATE POLICY "Managers can read pricing rules"
ON public.pricing_rules FOR SELECT
USING (public.has_role(auth.uid(), 'manager'::app_role));

-- pricing_rules: manager+ can manage
CREATE POLICY "Managers can manage pricing rules"
ON public.pricing_rules FOR ALL
USING (public.has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role));

-- Add read_at column to messages for proper read tracking
ALTER TABLE public.messages ADD COLUMN read_at timestamptz DEFAULT NULL;
