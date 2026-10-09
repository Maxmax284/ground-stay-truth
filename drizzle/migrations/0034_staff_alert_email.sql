CREATE TABLE IF NOT EXISTS public.staff_alert_emails (
  user_id uuid PRIMARY KEY,
  email text NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(email) <= 254),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_alert_emails TO authenticated;
GRANT ALL ON public.staff_alert_emails TO service_role;
ALTER TABLE public.staff_alert_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage own alert email" ON public.staff_alert_emails FOR ALL TO authenticated
  USING (user_id = auth.uid() AND NOT public.has_role(auth.uid(),'guest'))
  WITH CHECK (user_id = auth.uid() AND NOT public.has_role(auth.uid(),'guest'));
CREATE POLICY "Managers read alert emails" ON public.staff_alert_emails FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE TRIGGER trg_audit_staff_alert_emails AFTER INSERT OR UPDATE OR DELETE ON public.staff_alert_emails
  FOR EACH ROW EXECUTE FUNCTION public.log_ops_config_change();