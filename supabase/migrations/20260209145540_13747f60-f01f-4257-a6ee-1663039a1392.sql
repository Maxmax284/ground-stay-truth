
-- Fix RLS policies: Drop restrictive policies and recreate as permissive (default)
-- This is needed because the original policies were created as restrictive,
-- which requires ALL policies to pass instead of ANY.

-- user_roles
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- profiles
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- units
DROP POLICY IF EXISTS "Admins can manage units" ON public.units;
DROP POLICY IF EXISTS "Everyone can read active units" ON public.units;

CREATE POLICY "Admins can manage units"
  ON public.units FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Everyone can read active units"
  ON public.units FOR SELECT TO authenticated
  USING (is_active = true);

-- bookings
DROP POLICY IF EXISTS "Admins can manage all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Guests can read own bookings" ON public.bookings;

CREATE POLICY "Admins can manage all bookings"
  ON public.bookings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Guests can read own bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (guest_id = auth.uid());

-- booking_state_log
DROP POLICY IF EXISTS "Admins can manage booking logs" ON public.booking_state_log;

CREATE POLICY "Admins can manage booking logs"
  ON public.booking_state_log FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- pricing_rules
DROP POLICY IF EXISTS "Admins can manage pricing rules" ON public.pricing_rules;

CREATE POLICY "Admins can manage pricing rules"
  ON public.pricing_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- policy_settings
DROP POLICY IF EXISTS "Admins can manage policy settings" ON public.policy_settings;
DROP POLICY IF EXISTS "Authenticated users can read policy settings" ON public.policy_settings;

CREATE POLICY "Admins can manage policy settings"
  ON public.policy_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can read policy settings"
  ON public.policy_settings FOR SELECT TO authenticated
  USING (true);

-- payments
DROP POLICY IF EXISTS "Admins can manage payments" ON public.payments;

CREATE POLICY "Admins can manage payments"
  ON public.payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- messages
DROP POLICY IF EXISTS "Admins can manage messages" ON public.messages;
DROP POLICY IF EXISTS "Guests can read non-internal messages on own bookings" ON public.messages;

CREATE POLICY "Admins can manage messages"
  ON public.messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Guests can read non-internal messages on own bookings"
  ON public.messages FOR SELECT TO authenticated
  USING (
    is_internal = false
    AND booking_id IN (
      SELECT id FROM public.bookings WHERE guest_id = auth.uid()
    )
  );
