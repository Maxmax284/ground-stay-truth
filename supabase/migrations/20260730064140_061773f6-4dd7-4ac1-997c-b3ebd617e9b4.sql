GRANT SELECT ON public.email_send_log TO authenticated;

CREATE POLICY "Staff can read email send log"
ON public.email_send_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'front_desk_supervisor')
);

CREATE INDEX IF NOT EXISTS idx_email_send_log_booking
  ON public.email_send_log ((metadata->>'booking_id'), created_at DESC);