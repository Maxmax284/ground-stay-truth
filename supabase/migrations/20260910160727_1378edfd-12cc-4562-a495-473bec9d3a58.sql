-- Role-gated policies created without a TO clause apply to the `anon` role too.
-- `has_role` EXECUTE is (correctly) revoked from anon, so Postgres raises
-- "permission denied for function has_role" whenever an anonymous client reads
-- a table that also has a public-read policy (pricing_rules, reviews,
-- unit_groups, ...). Scoping each policy to `authenticated` is behaviour
-- preserving: has_role(auth.uid(), ...) is always false for anon.

DROP POLICY IF EXISTS "Admins can manage early checkin requests" ON public.early_checkin_requests;
CREATE POLICY "Admins can manage early checkin requests" ON public.early_checkin_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Managers can update early checkin requests" ON public.early_checkin_requests;
CREATE POLICY "Managers can update early checkin requests" ON public.early_checkin_requests
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Admins can read email log" ON public.email_log;
CREATE POLICY "Admins can read email log" ON public.email_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Maintenance can read assigned tasks" ON public.housekeeping_tasks;
CREATE POLICY "Maintenance can read assigned tasks" ON public.housekeeping_tasks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'maintenance'));

DROP POLICY IF EXISTS "Maintenance can update assigned tasks" ON public.housekeeping_tasks;
CREATE POLICY "Maintenance can update assigned tasks" ON public.housekeeping_tasks
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'maintenance') AND assigned_to = auth.uid());

DROP POLICY IF EXISTS "Managers can manage housekeeping tasks" ON public.housekeeping_tasks;
CREATE POLICY "Managers can manage housekeeping tasks" ON public.housekeeping_tasks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Admins can manage laundry requests" ON public.laundry_requests;
CREATE POLICY "Admins can manage laundry requests" ON public.laundry_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Managers can manage laundry requests" ON public.laundry_requests;
CREATE POLICY "Managers can manage laundry requests" ON public.laundry_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Admins can manage maintenance blocks" ON public.maintenance_blocks;
CREATE POLICY "Admins can manage maintenance blocks" ON public.maintenance_blocks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Managers can manage maintenance blocks" ON public.maintenance_blocks;
CREATE POLICY "Managers can manage maintenance blocks" ON public.maintenance_blocks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Admins can manage maintenance requests" ON public.maintenance_requests;
CREATE POLICY "Admins can manage maintenance requests" ON public.maintenance_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Maintenance can update maintenance requests" ON public.maintenance_requests;
CREATE POLICY "Maintenance can update maintenance requests" ON public.maintenance_requests
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'maintenance'));

DROP POLICY IF EXISTS "Managers can manage maintenance requests" ON public.maintenance_requests;
CREATE POLICY "Managers can manage maintenance requests" ON public.maintenance_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Managers delete all bindings" ON public.messaging_chat_bindings;
CREATE POLICY "Managers delete all bindings" ON public.messaging_chat_bindings
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Managers read all bindings" ON public.messaging_chat_bindings;
CREATE POLICY "Managers read all bindings" ON public.messaging_chat_bindings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Admins can manage all notifications" ON public.notifications;
CREATE POLICY "Admins can manage all notifications" ON public.notifications
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can read payment events" ON public.payment_events;
CREATE POLICY "Admins can read payment events" ON public.payment_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage checklist" ON public.pre_arrival_checklist;
CREATE POLICY "Admins can manage checklist" ON public.pre_arrival_checklist
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Managers can manage pricing rules" ON public.pricing_rules;
CREATE POLICY "Managers can manage pricing rules" ON public.pricing_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Managers can read pricing rules" ON public.pricing_rules;
CREATE POLICY "Managers can read pricing rules" ON public.pricing_rules
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Admins can insert audit log" ON public.review_audit_log;
CREATE POLICY "Admins can insert audit log" ON public.review_audit_log
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can read audit log" ON public.review_audit_log;
CREATE POLICY "Admins can read audit log" ON public.review_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage reviews" ON public.reviews;
CREATE POLICY "Admins can manage reviews" ON public.reviews
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Managers can manage security deposits" ON public.security_deposits;
CREATE POLICY "Managers can manage security deposits" ON public.security_deposits
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Supervisors can read security deposits" ON public.security_deposits;
CREATE POLICY "Supervisors can read security deposits" ON public.security_deposits
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'front_desk_supervisor'));

DROP POLICY IF EXISTS "Admins can manage stay support log" ON public.stay_support_log;
CREATE POLICY "Admins can manage stay support log" ON public.stay_support_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage unit groups" ON public.unit_groups;
CREATE POLICY "Admins can manage unit groups" ON public.unit_groups
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));