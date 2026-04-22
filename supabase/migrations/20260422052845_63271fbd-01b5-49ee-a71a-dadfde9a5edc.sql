-- Guest escalations table for Kru Glitch -> staff handoffs from messaging bridge
CREATE TABLE public.guest_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_user_id uuid NOT NULL,
  channel text NOT NULL,
  chat_id text NOT NULL,
  summary text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_guest_escalations_unresolved ON public.guest_escalations (created_at DESC) WHERE resolved = false;
CREATE INDEX idx_guest_escalations_guest ON public.guest_escalations (guest_user_id);

ALTER TABLE public.guest_escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage escalations"
  ON public.guest_escalations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers manage escalations"
  ON public.guest_escalations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Front desk read and update escalations"
  ON public.guest_escalations FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'front_desk'::app_role) OR has_role(auth.uid(), 'front_desk_supervisor'::app_role));

CREATE POLICY "Front desk resolve escalations"
  ON public.guest_escalations FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'front_desk'::app_role) OR has_role(auth.uid(), 'front_desk_supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'front_desk'::app_role) OR has_role(auth.uid(), 'front_desk_supervisor'::app_role));

CREATE POLICY "Guests read own escalations"
  ON public.guest_escalations FOR SELECT TO authenticated
  USING (guest_user_id = auth.uid());